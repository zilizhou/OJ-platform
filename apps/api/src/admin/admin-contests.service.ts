import { Injectable, NotFoundException } from '@nestjs/common';
import { ContestRuleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from '../contests/leaderboard.service';

export interface ContestInput {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  ruleType?: ContestRuleType;
  password?: string | null;
  freezeMinutes?: number;
  problems?: { problemId: number; alias: string; order?: number; score?: number }[];
}

@Injectable()
export class AdminContestsService {
  constructor(private prisma: PrismaService, private leaderboard: LeaderboardService) {}

  list() {
    return this.prisma.contest.findMany({
      orderBy: { startTime: 'desc' },
      include: { _count: { select: { problems: true, registrations: true } } },
    });
  }

  get(id: number) {
    return this.prisma.contest.findUnique({
      where: { id },
      include: {
        problems: {
          orderBy: { order: 'asc' },
          include: { problem: { select: { id: true, title: true } } },
        },
      },
    });
  }

  create(adminId: number, input: ContestInput) {
    return this.prisma.contest.create({
      data: {
        title: input.title,
        description: input.description ?? '',
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        ruleType: input.ruleType ?? 'ACM',
        password: input.password || null,
        freezeMinutes: input.freezeMinutes ?? 0,
        createdBy: adminId,
        problems: input.problems?.length
          ? { create: input.problems.map((p, i) => ({
              problemId: p.problemId,
              alias: p.alias || String.fromCharCode(65 + i),
              order: p.order ?? i,
              score: p.score ?? 100,
            })) }
          : undefined,
      },
    });
  }

  async update(id: number, input: Partial<ContestInput>) {
    const exists = await this.prisma.contest.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('比赛不存在');

    return this.prisma.$transaction(async (tx) => {
      await tx.contest.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          startTime: input.startTime ? new Date(input.startTime) : undefined,
          endTime: input.endTime ? new Date(input.endTime) : undefined,
          ruleType: input.ruleType,
          password: input.password,
          freezeMinutes: input.freezeMinutes,
        },
      });
      if (input.problems) {
        await tx.contestProblem.deleteMany({ where: { contestId: id } });
        if (input.problems.length) {
          await tx.contestProblem.createMany({
            data: input.problems.map((p, i) => ({
              contestId: id,
              problemId: p.problemId,
              alias: p.alias || String.fromCharCode(65 + i),
              order: p.order ?? i,
              score: p.score ?? 100,
            })),
          });
        }
      }
      return tx.contest.findUnique({ where: { id }, include: { problems: true } });
    });
  }

  async delete(id: number) {
    await this.prisma.contest.delete({ where: { id } });
    return { ok: true };
  }

  /** 解冻封榜:写入 unfrozenAt,触发 leaderboard 计算把封榜期内的提交全部纳入 */
  async unfreeze(id: number) {
    const c = await this.prisma.contest.update({
      where: { id },
      data: { unfrozenAt: new Date() },
    });
    await this.leaderboard.invalidate(id);
    return c;
  }
}
