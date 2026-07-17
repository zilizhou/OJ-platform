import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContestsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.contest.findMany({
      orderBy: { startTime: 'desc' },
      include: { _count: { select: { problems: true, registrations: true } } },
    });
  }

  async get(id: number, userId?: number) {
    const contest = await this.prisma.contest.findUnique({
      where: { id },
      include: {
        problems: {
          orderBy: { order: 'asc' },
          include: {
            problem: { select: { id: true, title: true, difficulty: true } },
          },
        },
        _count: { select: { registrations: true } },
      },
    });
    if (!contest) throw new NotFoundException('比赛不存在');

    let registered = false;
    if (userId) {
      const reg = await this.prisma.contestRegistration.findUnique({
        where: { contestId_userId: { contestId: id, userId } },
      });
      registered = !!reg;
    }

    // 比赛未开始时隐藏题面具体信息(只露 alias),保持悬念
    const now = new Date();
    const hideProblems = now < contest.startTime;
    return {
      ...contest,
      registered,
      hideProblems,
      problems: hideProblems
        ? contest.problems.map((p) => ({ alias: p.alias, score: p.score, problem: null }))
        : contest.problems,
    };
  }

  async register(contestId: number, userId: number, password?: string) {
    const contest = await this.prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) throw new NotFoundException('比赛不存在');
    if (new Date() > contest.endTime) throw new BadRequestException('比赛已结束');
    if (contest.password && contest.password !== password) {
      throw new ForbiddenException('密码错误');
    }
    await this.prisma.contestRegistration.upsert({
      where: { contestId_userId: { contestId, userId } },
      update: {},
      create: { contestId, userId },
    });
    return { ok: true };
  }

  /** 比赛进行中、用户已注册才可提交 */
  async assertCanSubmit(contestId: number, userId: number) {
    const contest = await this.prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) throw new NotFoundException('比赛不存在');
    const now = new Date();
    if (now < contest.startTime) throw new BadRequestException('比赛尚未开始');
    if (now > contest.endTime) throw new BadRequestException('比赛已结束');
    const reg = await this.prisma.contestRegistration.findUnique({
      where: { contestId_userId: { contestId, userId } },
    });
    if (!reg) throw new ForbiddenException('请先报名比赛');
    return contest;
  }

  /** 校验题目属于比赛 */
  async assertProblemInContest(contestId: number, problemId: number) {
    const cp = await this.prisma.contestProblem.findUnique({
      where: { contestId_problemId: { contestId, problemId } },
    });
    if (!cp) throw new BadRequestException('题目不在该比赛中');
    return cp;
  }
}
