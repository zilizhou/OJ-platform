import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env', '../../.env'] });
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { hostname } from 'os';
import { PrismaClient } from '@prisma/client';
import { judge, reapStaleSandboxes } from './runner';
import { fetchTestcase } from './oss';

// 与 apps/api/src/queue/queue.service.ts 的 RunJobData 保持一致(避免跨包 import)
interface RunJobData {
  requestId: string;
  language: string;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testcases: { input: string; expectedOutput: string }[];
  spj?: { language: string; code: string };
}

const prisma = new PrismaClient();
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
};
const redis = new IORedis(connection);

// 提交限流 Pending 计数释放,与 submissions.service.ts 保持键一致
const PENDING_COUNT_KEY = (uid: number) => `oj:pendsub:${uid}`;
function releasePendingSlot(uid: number) {
  redis.decr(PENDING_COUNT_KEY(uid)).catch(() => {});
}
// 通过率缓存失效,与 problems.service.ts 保持键一致
function invalidateAcceptanceRate() {
  redis.del('oj:accrate:stamp').catch(() => {});
}

// 判题统计:写入 Redis Hash,API metrics.refresh 拉聚合到 Prometheus
const STATS_KEY = 'oj:judge:stats';
function recordJudgeStats(result: { status: string; timeMs: number; memoryKb: number }, caseCount: number) {
  const p = redis.multi();
  p.hincrby(STATS_KEY, 'judged_total', 1);
  p.hincrby(STATS_KEY, `status_${result.status}`, 1);
  p.hincrby(STATS_KEY, 'cases_total', caseCount);
  // 桶式直方图:ms 桶 [100,250,500,1000,2000,4000,8000]
  const durMs = result.timeMs;
  const buckets = [100, 250, 500, 1000, 2000, 4000, 8000];
  for (const b of buckets) if (durMs <= b) p.hincrby(STATS_KEY, `case_dur_bucket_${b}`, 1);
  p.hincrby(STATS_KEY, 'case_dur_bucket_inf', 1);
  p.exec().catch(() => {});
}
const workerId = `${hostname()}#${process.pid}`;
const HEARTBEAT_TTL = 15; // s
let currentJobId: string | null = null;

const worker = new Worker(
  'judge',
  async (job) => {
    const submissionId: number = job.data.submissionId;
    currentJobId = String(job.id);
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { problem: { include: { testcases: true } } },
    });
    if (!submission) {
      console.warn(`submission ${submissionId} not found`);
      return;
    }

    // 幂等防护:已被最终态(AC/WA/.../SE)的提交不再重判,避免重复回写
    const FINAL_STATUSES = ['AC', 'WA', 'TLE', 'MLE', 'OLE', 'RE', 'CE', 'SE'];
    if (FINAL_STATUSES.includes(submission.status)) {
      console.log(`[${submissionId}] already final (${submission.status}), skip`);
      return;
    }

    const publish = async (payload: Record<string, any>) => {
      await redis.publish(`oj:submission:${submissionId}`, JSON.stringify(payload)).catch(() => {});
    };

    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'Judging' },
    });
    await publish({ id: submissionId, status: 'Judging' });

    try {
      const p = submission.problem;
      const spj = p.judgeMode === 'SPECIAL' && p.spjCode && p.spjLanguage
        ? { language: p.spjLanguage, code: p.spjCode }
        : undefined;
      // 测试点优先从 MinIO 拉(大数据);否则用 DB inline
      const testcases = await Promise.all(p.testcases.map(async (t) => ({
        input: t.inputKey ? await fetchTestcase(t.inputKey) : t.input,
        expectedOutput: t.expectedOutputKey ? await fetchTestcase(t.expectedOutputKey) : t.expectedOutput,
        isSample: t.isSample,
      })));
      const full = await judge({
        language: submission.language,
        code: submission.code,
        timeLimitMs: p.timeLimit,
        memoryLimitMb: p.memoryLimit,
        testcases,
        spj,
        submissionId,
      });

      // 防泄漏:提交模式下,非样例测点的 expectedOutput 不落库不下发
      // (用户的自己的 userOutput 可保留,它本身不暴露隐藏数据)
      const safeCases = full.cases.map((c, i) => {
        const tc = testcases[i];
        if (tc?.isSample) return c;
        const { expected, ...rest } = c;
        return rest as typeof c;
      });
      const result = { ...full, cases: safeCases };

      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: result.status,
          timeUsed: result.timeMs,
          memoryUsed: result.memoryKb,
          detail: { cases: result.cases, message: result.message } as any,
        },
      });
      await publish({
        id: submissionId,
        status: result.status,
        timeUsed: result.timeMs,
        memoryUsed: result.memoryKb,
        cases: result.cases,
      });
      console.log(`[${submissionId}] ${result.status} (${result.timeMs}ms)`);
      recordJudgeStats(result, result.cases.length);
    } catch (err: any) {
      console.error(`[${submissionId}] judge error`, err);
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: 'SE', detail: { error: String(err?.message || err) } as any },
      });
      await publish({ id: submissionId, status: 'SE' });
    } finally {
      // 释放提交限流 Pending 槽位(无论成功/失败)
      releasePendingSlot(submission.userId);
      // 通过率缓存失效(下次 list 重建)
      invalidateAcceptanceRate();
    }
  },
  { connection, concurrency: Number(process.env.JUDGE_CONCURRENCY) || 2 },
);

worker.on('ready', () => console.log(`judge worker ${workerId} ready`));

// ── run 队列: 自测运行(不落库),直接跑 judge() 并 publish 结果 ──
const RUN_QUEUE_NAME = 'run';
const runWorker = new Worker(
  RUN_QUEUE_NAME,
  async (job) => {
    const d = job.data as RunJobData;
    const publish = async (payload: Record<string, any>) => {
      await redis
        .publish(`oj:run:${d.requestId}`, JSON.stringify(payload))
        .catch(() => {});
    };
    try {
      const result = await judge({
        language: d.language,
        code: d.code,
        timeLimitMs: d.timeLimitMs,
        memoryLimitMb: d.memoryLimitMb,
        testcases: d.testcases,
        spj: d.spj,
        // run 自测:用户没填期望输出时跳过比对,只回显 stdout
        noExpectedSkipsDiff: true,
      });
      await publish({ ok: true, result });
    } catch (err: any) {
      await publish({ ok: false, error: String(err?.message || err) });
    }
  },
  { connection, concurrency: Number(process.env.RUN_CONCURRENCY) || 2 },
);
runWorker.on('ready', () => console.log(`run worker ${workerId} ready`));
runWorker.on('failed', (_j, err) => console.error('run job failed', err));

// 启动时跑一次,清掉 worker 崩溃前留下的沙箱;之后每 15s 兜底,阈值 30s
const STALE_KEY = 'oj:judge:stale_total';
reapStaleSandboxes(15).catch(() => {});
const reaperTimer = setInterval(async () => {
  const killed = await reapStaleSandboxes(30).catch(() => 0);
  if (killed > 0) await redis.hincrby(STATS_KEY, 'stale_killed_total', killed).catch(() => {});
  await redis.set(STALE_KEY, String(killed), 'EX', 60).catch(() => {});
}, 15_000);
worker.on('completed', () => { currentJobId = null; });
worker.on('failed', (job, err) => { currentJobId = null; console.error('job failed', job?.id, err); });

// 心跳: 5s 写一次,API 端聚合显示节点状态
const heartbeat = async () => {
  const payload = {
    workerId,
    pid: process.pid,
    hostname: hostname(),
    currentJobId,
    startedAt: process.uptime(),
    updatedAt: Date.now(),
  };
  await redis.set(`judge:worker:${workerId}`, JSON.stringify(payload), 'EX', HEARTBEAT_TTL);
};
heartbeat();
const hbTimer = setInterval(heartbeat, 5000);

process.on('SIGINT', async () => {
  clearInterval(hbTimer);
  clearInterval(reaperTimer);
  await redis.del(`judge:worker:${workerId}`).catch(() => {});
  await worker.close();
  await runWorker.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
});
