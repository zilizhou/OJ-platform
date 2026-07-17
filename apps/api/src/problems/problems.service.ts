import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { getVisualScript } from './visual-scripts/scripts';

export interface ListParams {
  q?: string;             // 标题模糊
  difficulty?: number;    // 1-5
  tags?: string[];        // 必须全部包含
  status?: 'AC' | 'ATTEMPTED' | 'TODO';  // 相对于 viewer
  viewerId?: number;
  page?: number;          // 1-based
  pageSize?: number;
}

export interface ProblemListRow {
  id: number;
  title: string;
  difficulty: number;
  tags: string[];
  timeLimit: number;
  memoryLimit: number;
  status: 'AC' | 'ATTEMPTED' | 'TODO';
  acceptanceRate: number; // 0-1
  acCount: number;
  totalCount: number;
}

export interface ProblemListResult {
  items: ProblemListRow[];
  total: number;
  page: number;
  pageSize: number;
}

// 通过率缓存:5 分钟 TTL(题目通过率变化慢,无需实时)
const ACC_RATE_TTL = 300;
const ACC_RATE_KEY = 'oj:accrate';
const ACC_RATE_STAMP_KEY = 'oj:accrate:stamp';

@Injectable()
export class ProblemsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * 题库列表:DB 层分页 + DB 层 status 筛选 + 通过率聚合(Redis 缓存)。
   *
   * status 下沉到 DB 的做法:
   *  - 先聚合 viewer 的 AC 题集 A 和 ATTEMPTED 题集 T(含 AC,即"提交过"集合)
   *  - AC   → problemId IN A
   *  - ATTEMPTED → problemId IN T 且 NOT IN A(尝试过但没过)
   *  - TODO → problemId NOT IN T
   */
  async list(p: ListParams = {}): Promise<ProblemListResult> {
    const page = Math.max(1, p.page || 1);
    const pageSize = Math.min(Math.max(1, p.pageSize || 20), 100);

    const where: any = {};
    if (p.q) where.title = { contains: p.q, mode: 'insensitive' };
    if (p.difficulty) where.difficulty = p.difficulty;
    if (p.tags && p.tags.length) where.tags = { hasEvery: p.tags };

    // viewer 状态集合
    let acIds: number[] = [];
    let attemptedIds: number[] = [];
    if (p.viewerId && (p.status || true)) {
      const subs = await this.prisma.submission.findMany({
        where: { userId: p.viewerId },
        select: { problemId: true, status: true },
      });
      const ac = new Set<number>();
      const att = new Set<number>();
      for (const s of subs) {
        att.add(s.problemId);
        if (s.status === 'AC') ac.add(s.problemId);
      }
      acIds = [...ac];
      attemptedIds = [...att];
    }

    if (p.status === 'AC') {
      where.id = { in: acIds };
    } else if (p.status === 'ATTEMPTED') {
      where.AND = [
        { id: { in: attemptedIds } },
        { id: { notIn: acIds } },
      ];
    } else if (p.status === 'TODO') {
      where.id = { notIn: attemptedIds };
    }

    const [total, problems] = await Promise.all([
      this.prisma.problem.count({ where }),
      this.prisma.problem.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, title: true, difficulty: true, tags: true,
          timeLimit: true, memoryLimit: true,
        },
      }),
    ]);

    // 通过率:全平台缓存(不随 viewer 变),空读时按需懒重建
    const accMap = await this.getAcceptanceRates();

    const acSet = new Set(acIds);
    const attSet = new Set(attemptedIds);
    const items: ProblemListRow[] = problems.map((q) => {
      const a = accMap.get(q.id) ?? { acCount: 0, totalCount: 0 };
      const status: ProblemListRow['status'] = acSet.has(q.id)
        ? 'AC'
        : attSet.has(q.id)
          ? 'ATTEMPTED'
          : 'TODO';
      return {
        ...q,
        status,
        acceptanceRate: a.totalCount > 0 ? a.acCount / a.totalCount : 0,
        acCount: a.acCount,
        totalCount: a.totalCount,
      };
    });

    return { items, total, page, pageSize };
  }

  /**
   * 通过率聚合:Redis Hash 存 `problemId -> {ac,total}` 字符串,5分钟 TTL。
   * 第一次或过期时全量 group by 计算(单次 SQL,大库仍快)。
   */
  private async getAcceptanceRates(): Promise<Map<number, { acCount: number; totalCount: number }>> {
    const stamp = await this.redis.client.get(ACC_RATE_STAMP_KEY);
    if (stamp) {
      const raw = await this.redis.client.hgetall(ACC_RATE_KEY);
      const m = new Map<number, { acCount: number; totalCount: number }>();
      for (const [k, v] of Object.entries(raw)) {
        m.set(Number(k), JSON.parse(v));
      }
      return m;
    }
    // 重建:一次性 groupBy,Prisma 不支持聚合数组直接返回,用 fallback SQL
    const rows: { problemId: number; acCount: bigint; totalCount: bigint }[] =
      await this.prisma.$queryRaw`
        SELECT "problemId",
               COUNT(*)::bigint AS "totalCount",
               COUNT(*) FILTER (WHERE status = 'AC')::bigint AS "acCount"
        FROM "Submission"
        GROUP BY "problemId"
      `;
    const m = new Map<number, { acCount: number; totalCount: number }>();
    const pipeline = this.redis.client.multi();
    pipeline.del(ACC_RATE_KEY);
    for (const r of rows) {
      const ac = Number(r.acCount);
      const tot = Number(r.totalCount);
      m.set(r.problemId, { acCount: ac, totalCount: tot });
      pipeline.hset(ACC_RATE_KEY, String(r.problemId), JSON.stringify({ acCount: ac, totalCount: tot }));
    }
    pipeline.set(ACC_RATE_STAMP_KEY, '1', 'EX', ACC_RATE_TTL);
    await pipeline.exec().catch(() => {});
    return m;
  }

  /** 判题完成后调用,使该题通过率缓存失效(下次 list 懒重建) */
  async invalidateAcceptanceRate(problemId: number) {
    await this.redis.client.del(ACC_RATE_STAMP_KEY).catch(() => {});
  }

  /** 今日每日一题:按日期确定性挑选,缓存 Redis 24h */
  async daily(): Promise<{ id: number; title: string; difficulty: number; tags: string[] } | null> {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    const cacheKey = `oj:daily:${dateKey}`;
    const cached = await this.redis.client.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const count = await this.prisma.problem.count();
    if (count === 0) return null;
    // 用日期生成确定性 hash
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
    const skip = (dayOfYear * 7919) % count; // 乘大质数避开"靠前题永远在周末"
    const [p] = await this.prisma.problem.findMany({
      skip, take: 1, orderBy: { id: 'asc' },
      select: { id: true, title: true, difficulty: true, tags: true },
    });
    if (p) await this.redis.client.set(cacheKey, JSON.stringify(p), 'EX', 86400).catch(() => {});
    return p ?? null;
  }

  async tags(): Promise<string[]> {
    const rows = await this.prisma.problem.findMany({ select: { tags: true } });
    const set = new Set<string>();
    for (const r of rows) for (const t of r.tags) set.add(t);
    return [...set].sort();
  }

  async get(id: number, viewerId?: number) {
    const problem = await this.prisma.problem.findUnique({
      where: { id },
      include: { testcases: { where: { isSample: true } } },
    });
    if (!problem) throw new NotFoundException('题目不存在');

    const accMap = await this.getAcceptanceRates();
    const a = accMap.get(id) ?? { acCount: 0, totalCount: 0 };

    // viewer 是否已 AC 本题(给前端"题解发布门禁"用)
    let userHasAccepted = false;
    if (viewerId) {
      const acked = await this.prisma.submission.findFirst({
        where: { userId: viewerId, problemId: id, status: 'AC' },
        select: { id: true },
      });
      userHasAccepted = !!acked;
    }

    return {
      ...problem,
      acceptanceRate: a.totalCount > 0 ? a.acCount / a.totalCount : 0,
      acCount: a.acCount,
      totalCount: a.totalCount,
      userHasAccepted,
    };
  }

  getVisualSolution(problemId: number) {
    const script = getVisualScript(problemId);
    if (!script) throw new NotFoundException('本题暂无动画讲解');
    return script;
  }
}