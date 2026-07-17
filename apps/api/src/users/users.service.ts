import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { deriveBadges } from './badges';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async profile(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    // 统计
    const totalSubmissions = await this.prisma.submission.count({ where: { userId: user.id } });

    const acSubs = await this.prisma.submission.findMany({
      where: { userId: user.id, status: 'AC' },
      orderBy: { createdAt: 'asc' },
      select: {
        problemId: true,
        createdAt: true,
        language: true,
        problem: { select: { id: true, title: true, difficulty: true, tags: true } },
      },
    });

    const solvedSet = new Map<number, typeof acSubs[number]>();
    for (const s of acSubs) if (!solvedSet.has(s.problemId)) solvedSet.set(s.problemId, s);
    const solved = [...solvedSet.values()];

    const acByDifficulty = [1, 2, 3, 4, 5].map((d) => ({
      difficulty: d,
      count: solved.filter((s) => s.problem.difficulty === d).length,
    }));

    const languages = await this.prisma.submission.groupBy({
      by: ['language'],
      where: { userId: user.id },
      _count: { _all: true },
    });

    const contestCount = await this.prisma.contestRegistration.count({ where: { userId: user.id } });

    // 最近 365 天提交日历 (key: yyyy-mm-dd -> count)
    const since = new Date();
    since.setDate(since.getDate() - 365);
    const recent = await this.prisma.submission.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const calendar: Record<string, number> = {};
    for (const r of recent) {
      const k = r.createdAt.toISOString().slice(0, 10);
      calendar[k] = (calendar[k] || 0) + 1;
    }

    const badges = deriveBadges({
      acProblemCount: solved.length,
      totalSubmissions,
      languageCount: languages.length,
      contestCount,
      firstAcAt: acSubs[0]?.createdAt ?? null,
    });

    return {
      user,
      stats: {
        acProblemCount: solved.length,
        totalSubmissions,
        contestCount,
        acByDifficulty,
        languages: languages.map((l) => ({ language: l.language, count: l._count._all })),
      },
      recentSolved: solved.slice(-12).reverse().map((s) => ({
        problem: s.problem,
        solvedAt: s.createdAt,
        language: s.language,
      })),
      calendar,
      badges,
    };
  }
}
