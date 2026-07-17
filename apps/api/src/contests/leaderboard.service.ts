import { Injectable, NotFoundException } from '@nestjs/common';
import { ContestRuleType, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const PENALTY_PER_WRONG_SEC = 20 * 60; // ACM: 罚时 20 分钟/错误

export interface CellResult {
  attempts: number;
  accepted: boolean;
  acTimeSec?: number;       // 距比赛开始秒数
  penaltyMin?: number;      // 罚时(分钟)— ACM
  score?: number;           // 得分 — IOI/OI
  firstBlood?: boolean;
  frozen?: boolean;         // 封榜期内未公开的提交
  frozenAttempts?: number;  // 封榜期内的尝试次数(只显示数量,不显示是否 AC)
}

export interface LeaderRow {
  rank: number;
  userId: number;
  username: string;
  totalScore: number;       // ACM=解题数, IOI/OI=分数
  totalPenalty: number;     // ACM 秒, IOI/OI 不用
  cells: Record<string, CellResult>; // alias -> result
}

export interface Leaderboard {
  contestId: number;
  ruleType: ContestRuleType;
  generatedAt: string;
  rows: LeaderRow[];
  frozen: boolean;          // 当前榜是否处于封榜状态
  freezeTimeSec?: number;   // 封榜时刻距比赛开始的秒数
}

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  private cacheKey(id: number) {
    return `leaderboard:contest:${id}`;
  }

  invalidate(contestId: number) {
    return this.redis.del(this.cacheKey(contestId));
  }

  async get(contestId: number): Promise<Leaderboard> {
    const cached = await this.redis.getJson<Leaderboard>(this.cacheKey(contestId));
    if (cached) return cached;
    const result = await this.compute(contestId);
    await this.redis.setJson(this.cacheKey(contestId), result, 3); // 3s TTL,实时性 vs 负载折中
    return result;
  }

  async compute(contestId: number): Promise<Leaderboard> {
    const contest = await this.prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        problems: { orderBy: { order: 'asc' } },
        registrations: { include: { user: { select: { id: true, username: true } } } },
      },
    });
    if (!contest) throw new NotFoundException('比赛不存在');

    // 封榜时刻 = 比赛结束前 freezeMinutes 分钟。
    // 当前时间在 freezeAt..endTime 之间且尚未 unfrozenAt → 进入冻结。
    const now = new Date();
    const freezeAt = contest.freezeMinutes > 0
      ? new Date(contest.endTime.getTime() - contest.freezeMinutes * 60_000)
      : null;
    const frozen = !!(
      freezeAt
      && contest.freezeMinutes > 0
      && now >= freezeAt
      && (!contest.unfrozenAt || now < contest.unfrozenAt)
    );

    const submissions = await this.prisma.submission.findMany({
      where: {
        contestId,
        createdAt: { gte: contest.startTime, lte: contest.endTime },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        problemId: true,
        status: true,
        createdAt: true,
        detail: true,
      },
    });

    const aliasOf = new Map<number, string>();
    const scoreOf = new Map<number, number>();
    for (const cp of contest.problems) {
      aliasOf.set(cp.problemId, cp.alias);
      scoreOf.set(cp.problemId, cp.score);
    }

    const rows: LeaderRow[] = contest.registrations.map((r) => ({
      rank: 0,
      userId: r.userId,
      username: r.user.username,
      totalScore: 0,
      totalPenalty: 0,
      cells: {},
    }));
    const rowByUser = new Map(rows.map((r) => [r.userId, r]));

    if (contest.ruleType === 'ACM') {
      computeACM(rows, rowByUser, submissions, contest.startTime, aliasOf, frozen ? freezeAt! : null);
    } else if (contest.ruleType === 'IOI') {
      computeIOI(rows, rowByUser, submissions, aliasOf, scoreOf, 'best', frozen ? freezeAt! : null);
    } else {
      computeIOI(rows, rowByUser, submissions, aliasOf, scoreOf, 'last', frozen ? freezeAt! : null);
    }

    // 排序 + 排名
    rows.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return a.totalPenalty - b.totalPenalty;
    });
    let lastScore = -1;
    let lastPenalty = -1;
    let lastRank = 0;
    rows.forEach((r, i) => {
      if (r.totalScore === lastScore && r.totalPenalty === lastPenalty) {
        r.rank = lastRank;
      } else {
        r.rank = i + 1;
        lastRank = r.rank;
        lastScore = r.totalScore;
        lastPenalty = r.totalPenalty;
      }
    });

    return {
      contestId,
      ruleType: contest.ruleType,
      generatedAt: new Date().toISOString(),
      rows,
      frozen,
      freezeTimeSec: freezeAt
        ? Math.floor((freezeAt.getTime() - contest.startTime.getTime()) / 1000)
        : undefined,
    };
  }
}

function computeACM(
  rows: LeaderRow[],
  rowByUser: Map<number, LeaderRow>,
  submissions: { userId: number; problemId: number; status: SubmissionStatus; createdAt: Date }[],
  startTime: Date,
  aliasOf: Map<number, string>,
  freezeAt: Date | null,
) {
  const firstAcByProblem = new Map<number, number>(); // problemId -> userId (最早 AC)

  for (const s of submissions) {
    const row = rowByUser.get(s.userId);
    const alias = aliasOf.get(s.problemId);
    if (!row || !alias) continue;
    const cell = row.cells[alias] || { attempts: 0, accepted: false };
    if (cell.accepted) {
      row.cells[alias] = cell;
      continue;
    }
    // 封榜期内的提交不公开 verdict,只累计 frozenAttempts
    if (freezeAt && s.createdAt >= freezeAt) {
      cell.frozen = true;
      cell.frozenAttempts = (cell.frozenAttempts ?? 0) + 1;
      row.cells[alias] = cell;
      continue;
    }
    cell.attempts += 1;
    if (s.status === 'AC') {
      cell.accepted = true;
      const sec = Math.floor((s.createdAt.getTime() - startTime.getTime()) / 1000);
      cell.acTimeSec = sec;
      const wrong = cell.attempts - 1;
      cell.penaltyMin = Math.floor((sec + wrong * PENALTY_PER_WRONG_SEC) / 60);
      row.totalScore += 1;
      row.totalPenalty += sec + wrong * PENALTY_PER_WRONG_SEC;
      if (!firstAcByProblem.has(s.problemId)) {
        firstAcByProblem.set(s.problemId, s.userId);
        cell.firstBlood = true;
      }
    } else if (s.status === 'CE') {
      cell.attempts -= 1;
    }
    row.cells[alias] = cell;
  }
}

function caseScore(detail: any, baseScore: number): number {
  // 根据 judge 写回的 cases 数组算 通过率 * 题目分值
  const cases: { status: string }[] | undefined = detail?.cases;
  if (!cases || cases.length === 0) return 0;
  const ac = cases.filter((c) => c.status === 'AC').length;
  return Math.round((ac / cases.length) * baseScore);
}

function computeIOI(
  rows: LeaderRow[],
  rowByUser: Map<number, LeaderRow>,
  submissions: { userId: number; problemId: number; status: SubmissionStatus; createdAt: Date; detail: any }[],
  aliasOf: Map<number, string>,
  scoreOf: Map<number, number>,
  mode: 'best' | 'last',
  freezeAt: Date | null,
) {
  // 按 (user, problem) 分组 + 抠掉封榜期内的
  const groups = new Map<string, typeof submissions>();
  const frozenCount = new Map<string, number>();
  for (const s of submissions) {
    const k = `${s.userId}:${s.problemId}`;
    if (freezeAt && s.createdAt >= freezeAt) {
      frozenCount.set(k, (frozenCount.get(k) ?? 0) + 1);
      continue;
    }
    const arr = groups.get(k) || [];
    arr.push(s);
    groups.set(k, arr);
  }

  for (const [k, subs] of groups) {
    const [userIdStr, problemIdStr] = k.split(':');
    const userId = Number(userIdStr);
    const problemId = Number(problemIdStr);
    const row = rowByUser.get(userId);
    const alias = aliasOf.get(problemId);
    const base = scoreOf.get(problemId) ?? 100;
    if (!row || !alias) continue;

    let score = 0;
    if (mode === 'best') {
      for (const s of subs) score = Math.max(score, caseScore(s.detail, base));
    } else {
      // OI: 只看最后一次
      const last = subs[subs.length - 1];
      score = caseScore(last.detail, base);
    }
    const frozen = frozenCount.get(k);
    row.cells[alias] = {
      attempts: subs.length,
      accepted: score === base,
      score,
      ...(frozen ? { frozen: true, frozenAttempts: frozen } : {}),
    };
    row.totalScore += score;
  }
  // 用户在某题上只有封榜期提交,没有更早的:也要建格子
  for (const [k, n] of frozenCount.entries()) {
    if (groups.has(k)) continue;
    const [u, pid] = k.split(':').map(Number);
    const row = rowByUser.get(u);
    const alias = aliasOf.get(pid);
    if (!row || !alias) continue;
    row.cells[alias] = { attempts: 0, accepted: false, score: 0, frozen: true, frozenAttempts: n };
  }
}
