import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OauthZxyService } from '../auth/oauth-zxy.service';
import { LeaderboardService } from '../contests/leaderboard.service';

export interface CreateAssignmentDto {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  problemIds: number[];          // OJ 内部 problem.id 列表
  studentExtIds: string[];       // 知新芸 user.id 列表(字符串)
}

@Injectable()
export class IntegrationsService {
  constructor(
    private prisma: PrismaService,
    private oauth: OauthZxyService,
    private leaderboard: LeaderboardService,
  ) {}

  /** 教师选题用:复用 ProblemsService.list 的功能,但内部 viewer = admin 看全 */
  async listProblems(p: {
    q?: string; difficulty?: number; tags?: string[];
    page?: number; pageSize?: number;
  }) {
    const page = Math.max(1, p.page || 1);
    const pageSize = Math.min(Math.max(1, p.pageSize || 50), 200);
    const where: any = {};
    if (p.q) where.title = { contains: p.q, mode: 'insensitive' };
    if (p.difficulty) where.difficulty = p.difficulty;
    if (p.tags && p.tags.length) where.tags = { hasEvery: p.tags };
    const [total, items] = await Promise.all([
      this.prisma.problem.count({ where }),
      this.prisma.problem.findMany({
        where, orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, title: true, difficulty: true, tags: true, timeLimit: true, memoryLimit: true },
      }),
    ]);
    return { items, total, page, pageSize };
  }

  /** 批量预建/同步知新芸学生账号 */
  async syncUsers(users: { extId: string; username?: string; name?: string; email?: string; roles?: string[] }[]) {
    const results: { extId: string; ojUserId: number; username: string; role: string; created: boolean }[] = [];
    for (const u of users) {
      const before = await this.prisma.user.findFirst({
        where: { extProvider: 'zxy', extId: u.extId },
        select: { id: true },
      });
      const user = await this.oauth.upsertExtUser({ id: u.extId, ...u });
      results.push({
        extId: u.extId,
        ojUserId: user.id,
        username: user.username,
        role: user.role,
        created: !before,
      });
    }
    return { synced: results.length, results };
  }

  /** 创建作业:本质是创建一个私有 Contest + 录入学生 + 挂题目 */
  async createAssignment(dto: CreateAssignmentDto) {
    if (!dto.problemIds?.length) throw new BadRequestException('至少要选 1 道题');
    if (!dto.studentExtIds?.length) throw new BadRequestException('至少要录 1 个学生');

    // 解析学生 ext_id → OJ userId(没建账号的先 upsert 个占位)
    const studentUserIds: number[] = [];
    for (const extId of dto.studentExtIds) {
      let u = await this.prisma.user.findFirst({
        where: { extProvider: 'zxy', extId },
        select: { id: true },
      });
      if (!u) {
        const created = await this.oauth.upsertExtUser({ id: extId });
        u = { id: created.id };
      }
      studentUserIds.push(u.id);
    }

    // 校验题目存在
    const existingCount = await this.prisma.problem.count({
      where: { id: { in: dto.problemIds } },
    });
    if (existingCount !== dto.problemIds.length) {
      throw new BadRequestException(`部分题目不存在: 给 ${dto.problemIds.length} 个,只找到 ${existingCount}`);
    }

    // 找一个 admin id 作为 createdBy(否则 contest 表里得有合法 createdBy)
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' }, select: { id: true },
    });
    const createdBy = admin?.id ?? studentUserIds[0];

    const contest = await this.prisma.contest.create({
      data: {
        title: dto.title,
        description: dto.description ?? '',
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        ruleType: 'ACM',
        createdBy,
        problems: {
          create: dto.problemIds.map((pid, i) => ({
            problemId: pid,
            alias: String.fromCharCode(65 + i),
            order: i,
            score: 100,
          })),
        },
        registrations: { create: studentUserIds.map((uid) => ({ userId: uid })) },
      },
    });
    return {
      assignmentId: contest.id,
      ojContestUrl: `/contests/${contest.id}`,
      studentsRegistered: studentUserIds.length,
      problems: dto.problemIds.length,
    };
  }

  async updateAssignment(id: number, patch: Partial<CreateAssignmentDto>) {
    const exists = await this.prisma.contest.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('作业不存在');
    return this.prisma.$transaction(async (tx) => {
      if (patch.title !== undefined || patch.description !== undefined || patch.startTime || patch.endTime) {
        await tx.contest.update({
          where: { id },
          data: {
            title: patch.title,
            description: patch.description,
            startTime: patch.startTime ? new Date(patch.startTime) : undefined,
            endTime: patch.endTime ? new Date(patch.endTime) : undefined,
          },
        });
      }
      if (patch.problemIds) {
        await tx.contestProblem.deleteMany({ where: { contestId: id } });
        await tx.contestProblem.createMany({
          data: patch.problemIds.map((pid, i) => ({
            contestId: id, problemId: pid,
            alias: String.fromCharCode(65 + i), order: i, score: 100,
          })),
        });
      }
      if (patch.studentExtIds) {
        // 用 set 语义:删旧加新
        await tx.contestRegistration.deleteMany({ where: { contestId: id } });
        const userIds: number[] = [];
        for (const extId of patch.studentExtIds) {
          let u = await tx.user.findFirst({ where: { extProvider: 'zxy', extId }, select: { id: true } });
          if (!u) {
            const created = await this.oauth.upsertExtUser({ id: extId });
            u = { id: created.id };
          }
          userIds.push(u.id);
        }
        await tx.contestRegistration.createMany({
          data: userIds.map((uid) => ({ contestId: id, userId: uid })),
        });
      }
      return tx.contest.findUnique({ where: { id }, include: { problems: true, _count: { select: { registrations: true } } } });
    });
  }

  /** 每生 × 每题状态矩阵 */
  async getProgress(assignmentId: number) {
    const contest = await this.prisma.contest.findUnique({
      where: { id: assignmentId },
      include: {
        problems: { orderBy: { order: 'asc' }, include: { problem: { select: { id: true, title: true } } } },
        registrations: { include: { user: { select: { id: true, extId: true, extName: true, username: true } } } },
      },
    });
    if (!contest) throw new NotFoundException('作业不存在');

    const subs = await this.prisma.submission.findMany({
      where: {
        contestId: assignmentId,
        createdAt: { gte: contest.startTime, lte: contest.endTime },
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, problemId: true, status: true, createdAt: true },
    });

    // 索引: per (userId, problemId)
    type CellState = { status: 'AC' | 'ATTEMPTED' | 'TODO'; attempts: number; firstACTime: string | null };
    const cells = new Map<string, CellState>();
    for (const s of subs) {
      const k = `${s.userId}:${s.problemId}`;
      const prev = cells.get(k) ?? { status: 'TODO', attempts: 0, firstACTime: null };
      prev.attempts += 1;
      if (s.status === 'AC' && prev.status !== 'AC') {
        prev.status = 'AC';
        prev.firstACTime = s.createdAt.toISOString();
      } else if (prev.status !== 'AC') {
        prev.status = 'ATTEMPTED';
      }
      cells.set(k, prev);
    }

    return {
      assignmentId,
      title: contest.title,
      startTime: contest.startTime,
      endTime: contest.endTime,
      problems: contest.problems.map((cp) => ({
        problemId: cp.problemId, alias: cp.alias, title: cp.problem.title,
      })),
      students: contest.registrations.map((r) => ({
        extId: r.user.extId,
        name: r.user.extName,
        ojUserId: r.user.id,
        cells: contest.problems.map((cp) => {
          const c = cells.get(`${r.user.id}:${cp.problemId}`) ?? { status: 'TODO', attempts: 0, firstACTime: null };
          return { alias: cp.alias, ...c };
        }),
        acCount: contest.problems.reduce((acc, cp) => {
          const c = cells.get(`${r.user.id}:${cp.problemId}`);
          return acc + (c?.status === 'AC' ? 1 : 0);
        }, 0),
      })),
    };
  }

  /** 复用现有 ACM 排行榜 */
  getLeaderboard(assignmentId: number) {
    return this.leaderboard.get(assignmentId);
  }
}
