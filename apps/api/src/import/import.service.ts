import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OssService } from '../oss/oss.service';
import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { parseGenericZip } from './adapters/generic-zip.adapter';
import { parseFps } from './adapters/fps.adapter';
import { parseLuoguZip } from './adapters/luogu.adapter';
import { parseHydroZip } from './adapters/hydro.adapter';
import { UpfProblem, validateUpf, ValidationError } from './upf';
import { RedisService } from '../redis/redis.service';

export type ImportFormat = 'auto' | 'generic-zip' | 'fps' | 'luogu' | 'hydro';

export interface PreviewResult {
  format: ImportFormat;
  previewId: string;       // 后端缓存到 Redis,confirm 时只发这个,避免 200MB 的 body
  problems: UpfProblem[];
  errors: ValidationError[];
  duplicates: { title: string; sourceId?: string; existingId: number }[];
}

export interface ConfirmOptions {
  problems?: UpfProblem[];        // 旧入口
  previewId?: string;             // 新入口:从 Redis 缓存的预览拿
  onConflict: 'skip' | 'overwrite';
}

export interface ImportTaskState {
  status: 'processing' | 'done' | 'error';
  total: number;
  processed: number;
  created: number[];
  updated: number[];
  skipped: string[];
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

@Injectable()
export class ImportService {
  constructor(
    private prisma: PrismaService,
    private oss: OssService,
    private redis: RedisService,
  ) {}

  private async materializeCases(
    problemId: number,
    cases: { input: string; expectedOutput: string; isSample?: boolean; score?: number }[],
  ) {
    const out: any[] = [];
    for (const t of cases) {
      const inputKey = await this.oss.maybeUpload(problemId, 'in', t.input).catch(() => undefined);
      const expectedOutputKey = await this.oss
        .maybeUpload(problemId, 'out', t.expectedOutput)
        .catch(() => undefined);
      out.push({
        input: inputKey ? '' : t.input,
        expectedOutput: expectedOutputKey ? '' : t.expectedOutput,
        inputKey,
        expectedOutputKey,
        isSample: t.isSample ?? false,
        score: t.score ?? 10,
      });
    }
    return out;
  }

  private detect(filename: string, buffer: Buffer): ImportFormat {
    if (/\.xml$/i.test(filename)) return 'fps';
    const head = buffer.slice(0, 200).toString('utf-8').trimStart();
    if (head.startsWith('<?xml') || head.startsWith('<fps')) return 'fps';
    if (buffer.slice(0, 2).toString('ascii') === 'PK') {
      try {
        const zip = new AdmZip(buffer);
        let hasYaml = false;
        let hasProblemMd = false;
        let hasProblemJson = false;
        for (const e of zip.getEntries()) {
          if (e.entryName.startsWith('__MACOSX/')) continue;
          if (/(?:^|\/)problem\.yaml$/i.test(e.entryName)) hasYaml = true;
          if (/(?:^|\/)(problem\.md|description\.md|problem_zh\.md|problem_en\.md)$/i.test(e.entryName)) hasProblemMd = true;
          if (/(?:^|\/)problem\.json$/i.test(e.entryName)) hasProblemJson = true;
        }
        if (hasYaml) return 'hydro';
        if (hasProblemMd) return 'luogu';
        if (hasProblemJson) return 'generic-zip';
      } catch {}
      return 'generic-zip';
    }
    throw new BadRequestException('无法识别文件格式,请指定 format 参数');
  }

  async preview(filename: string, buffer: Buffer, format: ImportFormat): Promise<PreviewResult> {
    const detected = format === 'auto' ? this.detect(filename, buffer) : format;
    let problems: UpfProblem[];
    try {
      if (detected === 'generic-zip') problems = parseGenericZip(buffer);
      else if (detected === 'fps') problems = parseFps(buffer.toString('utf-8'));
      else if (detected === 'luogu') problems = parseLuoguZip(buffer);
      else if (detected === 'hydro') problems = parseHydroZip(buffer);
      else throw new BadRequestException(`不支持的格式: ${detected}`);
    } catch (e: any) {
      throw new BadRequestException(`解析失败: ${e.message}`);
    }

    if (problems.length === 0) {
      throw new BadRequestException(
        `识别为 "${detected}" 格式但解析出 0 道题。可能是文件结构不匹配预期约定 — 请尝试在格式下拉里手动指定。`,
      );
    }

    // 把 problems 缓存到 Redis,confirm 时只发 previewId
    const previewId = randomUUID();
    await this.redis.setJson(`import:preview:${previewId}`, problems, 2 * 60 * 60).catch(() => {});

    const errors = problems.flatMap((p) => validateUpf(p));

    // 去重检查 (设计文档 §5.4)
    const duplicates: PreviewResult['duplicates'] = [];
    for (const p of problems) {
      if (p.sourcePlatform && p.sourceId) {
        const exist = await this.prisma.problem.findUnique({
          where: {
            sourcePlatform_sourceId: { sourcePlatform: p.sourcePlatform, sourceId: p.sourceId },
          },
        });
        if (exist) {
          duplicates.push({ title: p.title, sourceId: p.sourceId, existingId: exist.id });
        }
      }
    }
    return { format: detected, previewId, problems, errors, duplicates };
  }

  private async resolveProblems(opts: ConfirmOptions): Promise<UpfProblem[]> {
    if (opts.previewId) {
      const cached = await this.redis.getJson<UpfProblem[]>(`import:preview:${opts.previewId}`);
      if (!cached) {
        throw new BadRequestException('预览已过期,请重新上传文件');
      }
      return cached;
    }
    if (opts.problems) return opts.problems;
    throw new BadRequestException('必须提供 previewId 或 problems');
  }

  /** 异步启动:返回 taskId,后台逐条入库,前端轮询 getTask */
  async enqueueConfirm(opts: ConfirmOptions): Promise<{ taskId: string }> {
    const problems = await this.resolveProblems(opts);
    const taskId = randomUUID();
    const state: ImportTaskState = {
      status: 'processing',
      total: problems.length,
      processed: 0,
      created: [],
      updated: [],
      skipped: [],
      startedAt: Date.now(),
    };
    await this.saveTask(taskId, state);
    this.runConfirm(taskId, problems, opts.onConflict).catch(async (e) => {
      try {
        state.status = 'error';
        state.error = String(e?.message || e);
        state.finishedAt = Date.now();
        await this.saveTask(taskId, state);
      } catch { /* Redis 也挂了就只能日志,前端会显示 0% */ }
    });
    return { taskId };
  }

  async getTask(taskId: string): Promise<ImportTaskState | null> {
    return this.redis.getJson<ImportTaskState>(`import:task:${taskId}`);
  }

  /** 写状态有重试 + 容错,Redis 偶尔挂掉单条 flush 不影响整个任务跑下去 */
  private async saveTask(taskId: string, state: ImportTaskState) {
    for (let i = 0; i < 3; i++) {
      try {
        await this.redis.setJson(`import:task:${taskId}`, state, 60 * 60);
        return;
      } catch (e) {
        if (i === 2) throw e;
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }
    }
  }

  private async runConfirm(taskId: string, problems: UpfProblem[], onConflict: 'skip' | 'overwrite') {
    const state = (await this.getTask(taskId))!;
    for (const p of problems) {
      try {
        const single = await this.confirmOne(p, onConflict);
        if (single.created) state.created.push(single.created);
        if (single.updated) state.updated.push(single.updated);
        if (single.skipped) state.skipped.push(single.skipped);
      } catch (e: any) {
        state.skipped.push(`${p.title}: ${String(e?.message || e).slice(0, 200)}`);
      }
      state.processed += 1;
      // 每 5 条或最后一条 flush;失败不致命,下次 flush 再补
      if (state.processed % 5 === 0 || state.processed === state.total) {
        await this.saveTask(taskId, state).catch(() => {});
      }
    }
    state.status = 'done';
    state.finishedAt = Date.now();
    await this.saveTask(taskId, state).catch(() => {});
  }

  private async confirmOne(
    p: UpfProblem,
    onConflict: 'skip' | 'overwrite',
  ): Promise<{ created?: number; updated?: number; skipped?: string }> {
    const errs = validateUpf(p);
    if (errs.length) {
      return { skipped: `${p.title}: ${errs.map((e) => e.message).join('; ')}` };
    }
    let existingId: number | null = null;
    if (p.sourcePlatform && p.sourceId) {
      const exist = await this.prisma.problem.findUnique({
        where: {
          sourcePlatform_sourceId: { sourcePlatform: p.sourcePlatform, sourceId: p.sourceId },
        },
      });
      existingId = exist?.id ?? null;
    }
    if (existingId && onConflict === 'skip') {
      return { skipped: `${p.title}: 已存在,跳过` };
    }
    if (existingId && onConflict === 'overwrite') {
      await this.prisma.testcase.deleteMany({ where: { problemId: existingId! } });
      const cases = await this.materializeCases(existingId!, p.testcases);
      await this.prisma.problem.update({
        where: { id: existingId! },
        data: {
          title: p.title,
          description: p.description,
          difficulty: p.difficulty ?? 1,
          timeLimit: p.timeLimit ?? 1000,
          memoryLimit: p.memoryLimit ?? 256,
          tags: p.tags ?? [],
          testcases: { create: cases },
        },
      });
      return { updated: existingId };
    }
    const c = await this.prisma.problem.create({
      data: {
        title: p.title,
        description: p.description,
        difficulty: p.difficulty ?? 1,
        timeLimit: p.timeLimit ?? 1000,
        memoryLimit: p.memoryLimit ?? 256,
        tags: p.tags ?? [],
        sourcePlatform: p.sourcePlatform,
        sourceId: p.sourceId,
      },
    });
    const cases = await this.materializeCases(c.id, p.testcases);
    await this.prisma.testcase.createMany({
      data: cases.map((tc) => ({ ...tc, problemId: c.id })),
    });
    return { created: c.id };
  }

  /** 旧的同步入口,保留兼容 */
  async confirm(opts: ConfirmOptions) {
    const problems = await this.resolveProblems(opts);
    const { onConflict } = opts;
    const created: number[] = [];
    const updated: number[] = [];
    const skipped: string[] = [];

    for (const p of problems) {
      const errs = validateUpf(p);
      if (errs.length) {
        skipped.push(`${p.title}: ${errs.map((e) => e.message).join('; ')}`);
        continue;
      }

      let existingId: number | null = null;
      if (p.sourcePlatform && p.sourceId) {
        const exist = await this.prisma.problem.findUnique({
          where: {
            sourcePlatform_sourceId: { sourcePlatform: p.sourcePlatform, sourceId: p.sourceId },
          },
        });
        existingId = exist?.id ?? null;
      }

      if (existingId && onConflict === 'skip') {
        skipped.push(`${p.title}: 已存在,跳过`);
        continue;
      }

      if (existingId && onConflict === 'overwrite') {
        await this.prisma.testcase.deleteMany({ where: { problemId: existingId! } });
        const cases = await this.materializeCases(existingId!, p.testcases);
        await this.prisma.problem.update({
          where: { id: existingId! },
          data: {
            title: p.title,
            description: p.description,
            difficulty: p.difficulty ?? 1,
            timeLimit: p.timeLimit ?? 1000,
            memoryLimit: p.memoryLimit ?? 256,
            tags: p.tags ?? [],
            testcases: { create: cases },
          },
        });
        updated.push(existingId);
      } else {
        const c = await this.prisma.problem.create({
          data: {
            title: p.title,
            description: p.description,
            difficulty: p.difficulty ?? 1,
            timeLimit: p.timeLimit ?? 1000,
            memoryLimit: p.memoryLimit ?? 256,
            tags: p.tags ?? [],
            sourcePlatform: p.sourcePlatform,
            sourceId: p.sourceId,
          },
        });
        const cases = await this.materializeCases(c.id, p.testcases);
        await this.prisma.testcase.createMany({
          data: cases.map((tc) => ({ ...tc, problemId: c.id })),
        });
        created.push(c.id);
      }
    }

    return { created, updated, skipped };
  }
}
