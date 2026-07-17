import { Injectable } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

export interface WorkerNode {
  workerId: string;
  hostname: string;
  pid: number;
  currentJobId: string | null;
  updatedAt: number;
  alive: boolean; // 10s 内有心跳即在线
}

@Injectable()
export class JudgeStatusService {
  constructor(
    private queue: QueueService,
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async status() {
    const counts = await this.queue.judgeQueue.getJobCounts(
      'waiting', 'active', 'completed', 'failed', 'delayed',
    );

    // 扫所有 worker 心跳 key
    const keys = await this.redis.client.keys('judge:worker:*');
    const workers: WorkerNode[] = [];
    if (keys.length) {
      const vals = await this.redis.client.mget(...keys);
      const now = Date.now();
      for (const raw of vals) {
        if (!raw) continue;
        const w = JSON.parse(raw);
        workers.push({ ...w, alive: now - w.updatedAt < 10_000 });
      }
    }

    // 最近 10 条提交,反映吞吐
    const recent = await this.prisma.submission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        language: true,
        timeUsed: true,
        memoryUsed: true,
        createdAt: true,
        problem: { select: { title: true } },
        user: { select: { username: true } },
      },
    });

    return { counts, workers, recent };
  }

  async rejudge(submissionId: number) {
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'Pending', timeUsed: null, memoryUsed: null, detail: undefined as any },
    });
    await this.queue.enqueueJudge(submissionId);
    return { ok: true };
  }
}
