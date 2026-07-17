import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JudgeMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OssService } from '../oss/oss.service';

export interface ProblemInput {
  title: string;
  description: string;
  difficulty?: number;
  timeLimit?: number;
  memoryLimit?: number;
  tags?: string[];
  judgeMode?: JudgeMode;
  spjLanguage?: string | null;
  spjCode?: string | null;
  testcases?: { input: string; expectedOutput: string; isSample?: boolean; score?: number }[];
}

interface Viewer {
  userId: number;
  role: 'USER' | 'SETTER' | 'ADMIN';
}

@Injectable()
export class AdminProblemsService {
  constructor(private prisma: PrismaService, private oss: OssService) {}

  /** 教师(SETTER)与管理员均可管理全站题库；学生无此入口 */
  private canManageAll(viewer: Viewer) {
    return viewer.role === 'ADMIN' || viewer.role === 'SETTER';
  }

  list(viewer: Viewer) {
    return this.prisma.problem.findMany({
      where: this.canManageAll(viewer) ? {} : { createdBy: viewer.userId },
      orderBy: { id: 'asc' },
      include: { _count: { select: { testcases: true, submissions: true } } },
    });
  }

  async get(id: number, viewer: Viewer) {
    const p = await this.prisma.problem.findUnique({
      where: { id },
      include: { testcases: { orderBy: { id: 'asc' } } },
    });
    if (!p) throw new NotFoundException('题目不存在');
    if (!this.canManageAll(viewer) && p.createdBy !== viewer.userId) {
      throw new ForbiddenException('无权查看此题');
    }
    return p;
  }

  /** 走 OSS 还是 inline,统一封装 */
  private async materializeTestcase(
    problemId: number,
    tc: { input: string; expectedOutput: string; isSample?: boolean; score?: number },
  ) {
    const inputKey = await this.oss.maybeUpload(problemId, 'in', tc.input).catch(() => undefined);
    const expectedOutputKey = await this.oss
      .maybeUpload(problemId, 'out', tc.expectedOutput)
      .catch(() => undefined);
    return {
      input: inputKey ? '' : tc.input,
      expectedOutput: expectedOutputKey ? '' : tc.expectedOutput,
      inputKey,
      expectedOutputKey,
      isSample: tc.isSample ?? false,
      score: tc.score ?? 10,
    };
  }

  async create(viewer: Viewer, input: ProblemInput) {
    const created = await this.prisma.problem.create({
      data: {
        title: input.title,
        description: input.description,
        difficulty: input.difficulty ?? 1,
        timeLimit: input.timeLimit ?? 1000,
        memoryLimit: input.memoryLimit ?? 256,
        tags: input.tags ?? [],
        judgeMode: input.judgeMode ?? 'STANDARD',
        spjLanguage: input.spjLanguage ?? null,
        spjCode: input.spjCode ?? null,
        createdBy: viewer.userId,
      },
    });
    if (input.testcases?.length) {
      for (const tc of input.testcases) {
        const data = await this.materializeTestcase(created.id, tc);
        await this.prisma.testcase.create({ data: { problemId: created.id, ...data } });
      }
    }
    return this.get(created.id, viewer);
  }

  async update(id: number, viewer: Viewer, input: Partial<ProblemInput>) {
    const exists = await this.prisma.problem.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('题目不存在');
    if (!this.canManageAll(viewer) && exists.createdBy !== viewer.userId) {
      throw new ForbiddenException('无权编辑此题');
    }

    await this.prisma.problem.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        difficulty: input.difficulty,
        timeLimit: input.timeLimit,
        memoryLimit: input.memoryLimit,
        tags: input.tags,
        judgeMode: input.judgeMode,
        spjLanguage: input.spjLanguage,
        spjCode: input.spjCode,
      },
    });
    if (input.testcases) {
      // 清旧 (含 OSS 对象) + 写新
      const old = await this.prisma.testcase.findMany({ where: { problemId: id } });
      for (const t of old) {
        if (t.inputKey) await this.oss.delete(t.inputKey);
        if (t.expectedOutputKey) await this.oss.delete(t.expectedOutputKey);
      }
      await this.prisma.testcase.deleteMany({ where: { problemId: id } });
      for (const tc of input.testcases) {
        const data = await this.materializeTestcase(id, tc);
        await this.prisma.testcase.create({ data: { problemId: id, ...data } });
      }
    }
    return this.get(id, viewer);
  }

  async delete(id: number, viewer: Viewer) {
    const p = await this.prisma.problem.findUnique({ where: { id }, include: { testcases: true } });
    if (!p) throw new NotFoundException('题目不存在');
    if (!this.canManageAll(viewer) && p.createdBy !== viewer.userId) {
      throw new ForbiddenException('无权删除此题');
    }
    for (const t of p.testcases) {
      if (t.inputKey) await this.oss.delete(t.inputKey);
      if (t.expectedOutputKey) await this.oss.delete(t.expectedOutputKey);
    }
    await this.prisma.problem.delete({ where: { id } });
    return { ok: true };
  }
}
