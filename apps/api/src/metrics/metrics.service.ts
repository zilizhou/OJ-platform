import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  // 业务指标
  readonly httpReqs = new Counter({
    name: 'oj_http_requests_total',
    help: 'HTTP requests by route and status',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });
  readonly httpDur = new Histogram({
    name: 'oj_http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route'],
    buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10],
    registers: [this.registry],
  });
  readonly submissionsCreated = new Counter({
    name: 'oj_submissions_created_total',
    help: 'Total submissions created',
    labelNames: ['language'],
    registers: [this.registry],
  });
  readonly judgeQueueDepth = new Gauge({
    name: 'oj_judge_queue_depth',
    help: 'Current BullMQ judge queue depth',
    labelNames: ['state'],
    registers: [this.registry],
  });
  readonly judgeWorkersAlive = new Gauge({
    name: 'oj_judge_workers_alive',
    help: 'Number of judge workers with fresh heartbeats',
    registers: [this.registry],
  });
  readonly submissionsByStatus = new Gauge({
    name: 'oj_submissions_by_status',
    help: 'Lifetime submissions grouped by final status',
    labelNames: ['status'],
    registers: [this.registry],
  });
  readonly judgeCasesTotal = new Gauge({
    name: 'oj_judge_cases_total',
    help: 'Total testcases judged (all submissions)',
    registers: [this.registry],
  });
  readonly judgeCaseDurationBucket = new Gauge({
    name: 'oj_judge_case_duration_bucket',
    help: 'Testcase wall-time histogram (cumulative count per upper bound, ms)',
    labelNames: ['le'],
    registers: [this.registry],
  });
  readonly staleSandboxCount = new Gauge({
    name: 'oj_judge_stale_sandbox',
    help: 'Detected stale oj-sb-* sandboxes during last reaper pass',
    registers: [this.registry],
  });

  constructor(
    private queue: QueueService,
    private redis: RedisService,
    private prisma: PrismaService,
  ) {
    collectDefaultMetrics({ register: this.registry, prefix: 'oj_' });
  }

  onModuleInit() {
    // 每 10s 刷新 gauge — 拉时再算太重,提前算
    setInterval(() => this.refresh().catch(() => {}), 10_000);
    this.refresh().catch(() => {});
  }

  private async refresh() {
    const counts = await this.queue.judgeQueue.getJobCounts(
      'waiting', 'active', 'completed', 'failed', 'delayed',
    );
    for (const [k, v] of Object.entries(counts)) this.judgeQueueDepth.set({ state: k }, v as number);

    // 拉判题统计(Redis Hash,judge worker 写入)
    const stats = await this.redis.client.hgetall('oj:judge:stats').catch(() => ({} as Record<string, string>));
    const casesTotal = Number(stats.cases_total || 0);
    this.judgeCasesTotal.set(casesTotal);
    const buckets = [100, 250, 500, 1000, 2000, 4000, 8000];
    for (const b of buckets) {
      this.judgeCaseDurationBucket.set({ le: String(b) }, Number(stats[`case_dur_bucket_${b}`] || 0));
    }
    this.judgeCaseDurationBucket.set({ le: '+Inf' }, Number(stats.case_dur_bucket_inf || 0));
    const stale = Number(await this.redis.client.get('oj:judge:stale_total').catch(() => 0) || 0);
    this.staleSandboxCount.set(stale);

    const keys = await this.redis.client.keys('judge:worker:*');
    let alive = 0;
    if (keys.length) {
      const vals = await this.redis.client.mget(...keys);
      const now = Date.now();
      for (const v of vals) {
        if (!v) continue;
        try {
          const w = JSON.parse(v);
          if (now - w.updatedAt < 10_000) alive++;
        } catch {}
      }
    }
    this.judgeWorkersAlive.set(alive);

    const grouped = await this.prisma.submission.groupBy({ by: ['status'], _count: { _all: true } });
    for (const g of grouped) this.submissionsByStatus.set({ status: g.status }, g._count._all);
  }
}
