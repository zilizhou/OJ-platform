import { Injectable, NotFoundException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService, RunJobData } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import { ContestsService } from '../contests/contests.service';

const SUPPORTED_LANGUAGES = ['cpp', 'python', 'java', 'javascript'];

// 控制字符白名单:\t \n \r 允许,其余 < 0x20 拒绝;禁止 NUL(0x00)
const CODE_CTRL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
function validateCode(code: string) {
  if (!code || code.length > 64 * 1024) {
    throw new BadRequestException('代码为空或超过 64KB');
  }
  if (CODE_CTRL_RE.test(code)) {
    throw new BadRequestException('代码包含非法控制字符');
  }
}

const RUN_RATE_KEY = (uid: number) => `oj:runrl:${uid}`;
const RUN_RATE_MAX = 10;     // 每窗口最多 10 次
const RUN_RATE_WINDOW = 60;  // 60s
const RUN_CUSTOM_MAX = 5;    // 最多自定义测点数
const RUN_CUSTOM_INPUT_MAX = 256 * 1024; // 单测点输入上限 256KB

// 提交限流:每用户每题 10s 一条 + 全局并发 Pending≤2(防刷队列)
const SUBMIT_INTERVAL_KEY = (uid: number, pid: number) => `oj:subint:${uid}:${pid}`;
const SUBMIT_INTERVAL_SEC = 10;
const PENDING_COUNT_KEY = (uid: number) => `oj:pendsub:${uid}`;
const PENDING_MAX = 2;
const PENDING_TTL = 120; // 超过此时长视为僵尸,清理(单题最长时限 + 余量)

@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private queue: QueueService,
    private redis: RedisService,
    private contests: ContestsService,
  ) {}

  /** 简单滑窗限频:每用户 RUN_RATE_WINDOW 内最多 RUN_RATE_MAX 次 run */
  private async assertRunRateLimit(userId: number) {
    const key = RUN_RATE_KEY(userId);
    const n = await this.redis.client.incr(key);
    if (n === 1) await this.redis.client.expire(key, RUN_RATE_WINDOW);
    if (n > RUN_RATE_MAX) {
      throw new HttpException(
        `自测过于频繁,请 ${RUN_RATE_WINDOW}s 后再试 (上限 ${RUN_RATE_MAX} 次)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async create(
    userId: number,
    problemId: number,
    language: string,
    code: string,
    contestId?: number,
  ) {
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      throw new BadRequestException(`暂不支持语言: ${language}`);
    }
    validateCode(code);
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) throw new NotFoundException('题目不存在');

    if (contestId) {
      await this.contests.assertCanSubmit(contestId, userId);
      await this.contests.assertProblemInContest(contestId, problemId);
    }

    // 1) 同题提交间隔限流
    const intervalKey = SUBMIT_INTERVAL_KEY(userId, problemId);
    const setOk = await this.redis.client.set(intervalKey, '1', 'EX', SUBMIT_INTERVAL_SEC, 'NX');
    if (!setOk) {
      throw new HttpException(
        `提交过于频繁,请 ${SUBMIT_INTERVAL_SEC}s 后再试`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2) 并发 Pending 上限(用户级):用 Redisincr/decr 计数
    const pendKey = PENDING_COUNT_KEY(userId);
    const pendN = await this.redis.client.incr(pendKey);
    if (pendN === 1) await this.redis.client.expire(pendKey, PENDING_TTL);
    if (pendN > PENDING_MAX) {
      // 回滚 + 回滚间隔 key,允许立即重提
      await this.redis.client.decr(pendKey).catch(() => {});
      await this.redis.client.del(intervalKey).catch(() => {});
      throw new HttpException(
        `已有 ${PENDING_MAX} 个提交在评测中,请等待结果后再提交`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const submission = await this.prisma.submission.create({
      data: { userId, problemId, language, code, status: 'Pending', contestId },
    });
    await this.queue.enqueueJudge(submission.id);
    return { id: submission.id, status: submission.status };
  }

  /** 判题结束后由 worker(或 get 查询时)调用,释放 Pending 计数 */
  async releasePendingSlot(userId: number) {
    await this.redis.client.decr(PENDING_COUNT_KEY(userId)).catch(() => {});
  }

  /**
   * 自测运行:不落库,通过 run 队列交给 judge worker 执行,
   * API 端订阅 `oj:run:<requestId>` 等回结果(最长 30s)。
   * testcases 由调用方提供:用户自定义输入(无期望输出)或样例测点。
   */
  async run(
    userId: number,
    problemId: number,
    language: string,
    code: string,
    customInput?: string,
    customExpected?: string,
  ) {
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      throw new BadRequestException(`暂不支持语言: ${language}`);
    }
    validateCode(code);
    await this.assertRunRateLimit(userId);

    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
      include: { testcases: { where: { isSample: true } } },
    });
    if (!problem) throw new NotFoundException('题目不存在');

    const validateCustom = (s?: string) => {
      if (s !== undefined && s !== '' && s.length > RUN_CUSTOM_INPUT_MAX) {
        throw new BadRequestException(`自定义输入/期望超过 ${RUN_CUSTOM_INPUT_MAX / 1024}KB 上限`);
      }
    };
    validateCustom(customInput);
    validateCustom(customExpected);

    // 构造测点:
    //   - 用户填了 customInput  → 用一行单测点;若填了 customExpected 写入,用于 run 后比对(WA/AC)
    //   - 否则用题目样例测点(isSample);MinIO 大样例 run 留空
    //   - 都没有 → 跑空输入测一次
    let testcases: { input: string; expectedOutput: string }[];
    if (customInput !== undefined && customInput !== '') {
      const expected = (customExpected ?? '').trim();
      testcases = [{ input: customInput, expectedOutput: expected }];
    } else if (problem.testcases.length > 0) {
      testcases = problem.testcases.map((t) => ({
        input: t.inputKey ? '' : t.input,
        expectedOutput: t.expectedOutputKey ? '' : t.expectedOutput,
      }));
    } else {
      testcases = [{ input: '', expectedOutput: '' }];
    }
    if (testcases.length > RUN_CUSTOM_MAX) testcases = testcases.slice(0, RUN_CUSTOM_MAX);

    const spj =
      problem.judgeMode === 'SPECIAL' && problem.spjCode && problem.spjLanguage
        ? { language: problem.spjLanguage, code: problem.spjCode }
        : undefined;

    const requestId = randomUUID();
    const channel = `oj:run:${requestId}`;
    const jobData: RunJobData = {
      requestId,
      language,
      code,
      timeLimitMs: problem.timeLimit,
      memoryLimitMb: problem.memoryLimit,
      testcases,
      spj,
    };

    // 先订阅,再入队,避免丢失
    const sub = this.redis.client.duplicate();
    sub.on('error', () => {});
    await sub.subscribe(channel);

    await this.queue.enqueueRun(jobData);

    const result = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.unsubscribe(channel);
        sub.quit().catch(() => {});
        reject(new HttpException('运行超时,请稍后再试', HttpStatus.REQUEST_TIMEOUT));
      }, 30_000);

      sub.on('message', (_ch, message) => {
        clearTimeout(timer);
        sub.unsubscribe(channel);
        sub.quit().catch(() => {});
        try {
          const payload = JSON.parse(message);
          if (!payload.ok) reject(new BadRequestException(payload.error || '运行失败'));
          else resolve(payload.result);
        } catch (e) {
          reject(e);
        }
      });
    });

    return result;
  }

  async get(id: number) {
    const s = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true } },
        problem: { select: { id: true, title: true } },
      },
    });
    if (!s) throw new NotFoundException('提交不存在');

    // Pending 态附带队列位置(前端"前面约 N 人")
    const result: any = { ...s };
    if (s.status === 'Pending') {
      result.queuePosition = await this.queue.getJudgeQueuePosition(s.id);
    }
    return result;
  }

  list(params: { userId: number; problemId?: number; limit?: number }) {
    const { userId, problemId, limit = 50 } = params;
    return this.prisma.submission.findMany({
      where: {
        userId,
        ...(problemId != null && !Number.isNaN(problemId) ? { problemId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        userId: true,
        problemId: true,
        language: true,
        status: true,
        timeUsed: true,
        memoryUsed: true,
        createdAt: true,
        user: { select: { username: true } },
        problem: { select: { title: true } },
      },
    });
  }
}
