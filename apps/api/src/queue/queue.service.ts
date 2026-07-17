import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

export const JUDGE_QUEUE = 'judge';
export const RUN_QUEUE = 'run';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
};

// run 任务的入队荷载:直接带 code/language/testcases(均为小数据,inline),
// 由 judge worker 在 `run` 队列消费,跑完 publish 到 `oj:run:<jobId>`。
export interface RunJobData {
  requestId: string;
  language: string;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testcases: { input: string; expectedOutput: string }[];
  spj?: { language: string; code: string };
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly judgeQueue: Queue;
  readonly runQueue: Queue;

  constructor() {
    this.judgeQueue = new Queue(JUDGE_QUEUE, { connection });
    this.runQueue = new Queue(RUN_QUEUE, { connection });
  }

  enqueueJudge(submissionId: number) {
    return this.judgeQueue.add(
      'judge',
      { submissionId },
      { removeOnComplete: 1000, removeOnFail: 1000, attempts: 1 },
    );
  }

  enqueueRun(data: RunJobData) {
    return this.runQueue.add('run', data, {
      removeOnComplete: 500,
      removeOnFail: 500,
      attempts: 1,
    });
  }

  /**
   * 估计某 submission 在 judge 队列里的位置(0=正在处理,>0=前面还有 N 个)。
   * BullMQ job.data.submissionId 作为匹配键。返回位置,未找到返回 null。
   * 只查 waiting(+ active),不查 delayed(重试等通常不存在)。
   */
  async getJudgeQueuePosition(submissionId: number): Promise<number | null> {
    const jobs = await this.judgeQueue.getJobs(['waiting', 'active']);
    for (let i = 0; i < jobs.length; i++) {
      if (Number(jobs[i].data?.submissionId) === submissionId) return i;
    }
    return null;
  }

  async onModuleDestroy() {
    await Promise.all([this.judgeQueue.close(), this.runQueue.close()]);
  }
}
