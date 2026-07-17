import { spawn } from 'child_process';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LANGUAGES, LanguageSpec, SPJ_LANG } from './languages';

export interface TestCase {
  input: string;
  expectedOutput: string;
  isSample?: boolean;
}

export interface JudgeOptions {
  language: string;
  code: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testcases: TestCase[];
  spj?: { language: string; code: string };
  submissionId?: number;       // 用于沙箱命名 + reaper
  // run 模式:expectedOutput 为空字符串时,表示用户没填期望 → 跳过比对,只回显 stdout,该测点判 AC(无错判)
  // submit 模式:expectedOutput 必须来自 DB;空也是题目数据问题,不跳过(保留旧语义)
  noExpectedSkipsDiff?: boolean;
}

export type CaseStatus = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'OLE';
export type FinalStatus = CaseStatus | 'CE' | 'SE';

export interface CaseResult {
  status: CaseStatus;
  timeMs: number;
  memoryKb: number;
  message?: string;
  // 非运行错误时一并回显输入/期望/用户输出(各截断),便于前端 diff。
  // 防泄漏:只在 run 自测模式回传完整;提交模式由调用方过滤(见 index.ts)。
  expected?: string;
  userOutput?: string;
}

export interface JudgeResult {
  status: FinalStatus;
  timeMs: number;
  memoryKb: number;
  message?: string;
  cases: CaseResult[];
}

interface RunOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  wallMs: number;        // docker CLI 进程的 wall time(含容器启动开销)
  userTimeMs?: number;   // 仅用户代码 wall time(GNU time -f %e),Snap docker 下更准
  timedOut: boolean;
  outputExceeded: boolean;
  rssKb?: number;
}

const STATS_MARKER = '__OJ_STATS__:'; // %e:%M  → 用户代码 wall sec : peak RSS KB
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024; // 单测试点 stdout 上限
const SANDBOX_NAME_PREFIX = 'oj-sb-';

/** 后台 kill 容器,不阻塞主流程,失败静默(可能已经退出/被 reaper 抢先) */
function killContainer(name: string) {
  if (!name) return;
  const k = spawn('docker', ['kill', name], { stdio: 'ignore' });
  k.on('error', () => {});
}

function execDocker(
  args: string[],
  opts: { stdin?: string; timeoutMs?: number; containerName?: string } = {},
): Promise<RunOutput> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn('docker', args);
    let stdoutBuf = '';
    let stderrBuf = '';
    let stdoutBytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    let killTimer: NodeJS.Timeout | undefined;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      reject(err);
    };

    // spawn 失败(docker 二进制缺失 / EACCES 等)会触发 'error';_listener
    // 否则会变成 unhandledException 杀死整个 worker 进程而非优雅 SE。
    child.on('error', (err) => fail(err));

    const killAll = () => {
      if (opts.containerName) killContainer(opts.containerName);
      try { child.kill('SIGKILL'); } catch {}
    };

    if (opts.timeoutMs) {
      killTimer = setTimeout(() => {
        timedOut = true;
        killAll();
      }, opts.timeoutMs);
    }
    child.stdout?.on('data', (d: Buffer) => {
      stdoutBytes += d.length;
      if (stdoutBytes > OUTPUT_LIMIT_BYTES) {
        if (!outputExceeded) {
          outputExceeded = true;
          killAll();
        }
        return;
      }
      stdoutBuf += d.toString();
    });
    child.stderr?.on('data', (d) => (stderrBuf += d.toString()));
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      let rssKb: number | undefined;
      let userTimeMs: number | undefined;
      stderrBuf = stderrBuf.replace(
        new RegExp(`^${STATS_MARKER}([\\d.]+):(\\d+)$\\n?`, 'm'),
        (_, sec, kb) => {
          userTimeMs = Math.round(Number(sec) * 1000);
          rssKb = Number(kb);
          return '';
        },
      );
      resolve({
        stdout: stdoutBuf,
        stderr: stderrBuf,
        exitCode: code,
        wallMs: Date.now() - start,
        userTimeMs,
        timedOut,
        outputExceeded,
        rssKb,
      });
    });
    if (opts.stdin !== undefined) {
      child.stdin?.write(opts.stdin);
      child.stdin?.end();
    }
  });
}

function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n+$/, '');
}

/** 加固后的 sandbox 参数 (符合设计文档 §3.3) */
function sandboxArgs(memMb: number, containerName?: string): string[] {
  const relaxed = process.env.JUDGE_RELAXED_SANDBOX === '1';
  const args = [
    'run', '--rm', '-i',
    '--network=none',
    '--log-driver=none',   // 关键: 否则失败 kill 的沙箱无限输出会把宿主磁盘吃光
    `--memory=${memMb}m`,
    `--memory-swap=${memMb}m`,
    '--cpus=1',
    '--pids-limit=128',
  ];
  if (containerName) args.push('--name', containerName);
  if (!relaxed) {
    args.push(
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--read-only',
      '--tmpfs=/tmp:rw,size=64m,exec',
      '--tmpfs=/run:rw,size=8m',
    );
  }
  return args;
}

/**
 * 在容器里跑用户命令,后台采峰值 RSS (VmHWM, KB)。
 * 不依赖 /usr/bin/time —— alpine/busybox 也可用。
 */
function wrapWithMemPoll(cmd: string): string {
  // 优先用 /usr/bin/time -f "%e:%M" 一次性测 用户代码 wall + 峰值 RSS。
  // 没有 time 命令时直接 exec,fallback 到 docker CLI wall(包含 ~1.5s 容器启动开销)。
  return `
if command -v /usr/bin/time >/dev/null 2>&1; then
  TF=/tmp/__oj_t.$$
  /usr/bin/time -f "${STATS_MARKER}%e:%M" -o $TF sh -c '${cmd.replace(/'/g, `'\\''`)}'
  RC=$?
  cat $TF >&2
  rm -f $TF
  exit $RC
else
  exec sh -c '${cmd.replace(/'/g, `'\\''`)}'
fi
`.trim();
}

async function compile(
  spec: LanguageSpec,
  workdir: string,
  containerName: string,
  errFile = 'compile.err',
) {
  if (!spec.compile) return { ok: true as const };
  const out = await execDocker(
    [
      ...sandboxArgs(512, containerName),
      '-v', `${workdir}:/work`,
      '-w', '/work',
      spec.image,
      'sh', '-c', spec.compile,
    ],
    { timeoutMs: 30_000, containerName },
  );
  if (out.exitCode === 0) return { ok: true as const };
  let msg = out.stderr;
  try {
    msg = (await readFile(join(workdir, errFile), 'utf-8')) || msg;
  } catch {}
  return { ok: false as const, message: msg.slice(0, 4096), wallMs: out.wallMs };
}

async function runSpj(
  spjWorkdir: string,
  caseWorkdir: string,
  containerName: string,
): Promise<{ status: 'AC' | 'WA' | 'RE'; message?: string }> {
  const out = await execDocker(
    [
      ...sandboxArgs(256, containerName),
      '-v', `${spjWorkdir}:/spj:ro`,
      '-v', `${caseWorkdir}:/case:ro`,
      '-w', '/spj',
      SPJ_LANG.image,
      'sh', '-c', './spj /case/input /case/expected /case/user_output',
    ],
    { timeoutMs: 10_000, containerName },
  );
  if (out.exitCode === 0) return { status: 'AC' };
  if (out.exitCode === 1) return { status: 'WA', message: out.stdout.slice(0, 512) };
  return { status: 'RE', message: `SPJ 异常 exit=${out.exitCode}: ${out.stderr.slice(0, 512)}` };
}

function makeContainerName(submissionId: number | undefined, tag: string): string {
  const sid = submissionId ?? 0;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${SANDBOX_NAME_PREFIX}${sid}-${tag}-${rand}`;
}

export async function judge(opts: JudgeOptions): Promise<JudgeResult> {
  const spec = LANGUAGES[opts.language];
  if (!spec) {
    return { status: 'CE', timeMs: 0, memoryKb: 0, message: `不支持的语言: ${opts.language}`, cases: [] };
  }

  const workdir = join(tmpdir(), `oj-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const spjDir = opts.spj ? `${workdir}-spj` : '';
  const caseDir = join(workdir + '-case');
  await mkdir(workdir, { recursive: true });
  await mkdir(caseDir, { recursive: true });

  try {
    await writeFile(join(workdir, spec.sourceFile), opts.code);

    if (spec.compile) {
      const c = await compile(spec, workdir, makeContainerName(opts.submissionId, 'compile'));
      if (!c.ok) {
        return { status: 'CE', timeMs: c.wallMs ?? 0, memoryKb: 0, message: c.message, cases: [] };
      }
    }

    // 测例并行执行:每测点独立 caseDir(SPJ 互不干扰),并发 cap 由环境变量控制
    const CASE_CONCURRENCY = Math.max(1, Number(process.env.JUDGE_CASE_CONCURRENCY) || 4);
    const SNIPPET = 8192;
    const snippet = (s: string) => (s.length > SNIPPET ? s.slice(0, SNIPPET) + '\n…[截断]' : s);

    const runOne = async (i: number): Promise<CaseResult> => {
      const tc = opts.testcases[i];
      const cname = makeContainerName(opts.submissionId, `run${i + 1}`);
      const run = await execDocker(
        [
          ...sandboxArgs(opts.memoryLimitMb, cname),
          '-v', `${workdir}:/work:ro`,
          '-w', '/work',
          spec.image,
          'sh', '-c', wrapWithMemPoll(spec.run),
        ],
        // +5s 余量给容器启动(Snap docker 单次 ~1.5s)
        { stdin: tc.input, timeoutMs: opts.timeLimitMs + 5000, containerName: cname },
      );

      let status: CaseStatus;
      let msg: string | undefined;
      const rssKb = run.rssKb ?? 0;
      // 用户代码 wall(GNU time %e)优先,fallback 用 docker CLI wall
      const codeWallMs = run.userTimeMs ?? run.wallMs;

      if (run.outputExceeded) {
        status = 'OLE';
        msg = `输出超过 ${OUTPUT_LIMIT_BYTES / 1024 / 1024}MB,已强制终止`;
      } else if (run.timedOut || codeWallMs > opts.timeLimitMs) {
        status = 'TLE';
      } else if (run.exitCode === 137 || rssKb * 1024 > opts.memoryLimitMb * 1024 * 1024 * 0.95) {
        status = 'MLE';
      } else if (run.exitCode !== 0) {
        status = 'RE';
        msg = run.stderr.slice(0, 1024);
      } else if (opts.spj) {
        // SPJ:每测点独立子目录,避免并发写冲突
        const spjCaseDir = join(caseDir, `case${i}`);
        await mkdir(spjCaseDir, { recursive: true });
        await writeFile(join(spjCaseDir, 'input'), tc.input);
        await writeFile(join(spjCaseDir, 'expected'), tc.expectedOutput);
        await writeFile(join(spjCaseDir, 'user_output'), run.stdout);
        const r = await runSpj(spjDir, spjCaseDir, makeContainerName(opts.submissionId, `spj${i + 1}`));
        status = r.status === 'AC' ? 'AC' : r.status === 'WA' ? 'WA' : 'RE';
        msg = r.message;
      } else if (opts.noExpectedSkipsDiff && tc.expectedOutput === '') {
        // run 自测模式 + 用户没填期望 → 跳过比对,只回显 stdout,不判错
        status = 'AC';
      } else if (normalize(run.stdout) !== normalize(tc.expectedOutput)) {
        status = 'WA';
      } else {
        status = 'AC';
      }

      return {
        status,
        timeMs: codeWallMs,
        memoryKb: rssKb,
        message: msg,
        expected: status === 'AC' || status === 'OLE' ? undefined : snippet(tc.expectedOutput),
        // AC 也回传 userOutput(自测模式要看输出);提交模式由 index.ts 过滤
        userOutput: status === 'OLE' ? undefined : snippet(run.stdout),
      };
    };

    // 简单的有界并发池:一次性入队,逐个跑满 cap
    const results = new Array<CaseResult>(opts.testcases.length);
    let next = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(CASE_CONCURRENCY, opts.testcases.length); w++) {
      workers.push((async () => {
        while (true) {
          const i = next++;
          if (i >= opts.testcases.length) break;
          results[i] = await runOne(i);
        }
      })());
    }
    await Promise.all(workers);

    const cases = results;
    let worst: FinalStatus = 'AC';
    let maxTime = 0;
    let maxMem = 0;
    for (const c of cases) {
      maxTime = Math.max(maxTime, c.timeMs);
      maxMem = Math.max(maxMem, c.memoryKb);
      if (c.status !== 'AC' && worst === 'AC') worst = c.status;
    }

    return { status: worst, timeMs: maxTime, memoryKb: maxMem, cases };
  } finally {
    await Promise.all([
      rm(workdir, { recursive: true, force: true }),
      rm(caseDir, { recursive: true, force: true }),
      spjDir ? rm(spjDir, { recursive: true, force: true }) : Promise.resolve(),
    ]).catch(() => {});
  }
}

/** 扫描宿主上所有 oj-sb-* 沙箱,把跑了超过 maxAgeSec 秒的强制 kill。返回 killed 数。 */
export function reapStaleSandboxes(maxAgeSec = 60): Promise<number> {
  return new Promise((resolve) => {
    const ps = spawn('docker', [
      'ps', '--format', '{{.Names}}|{{.RunningFor}}|{{.CreatedAt}}',
      '--filter', `name=^${SANDBOX_NAME_PREFIX}`,
    ]);
    let out = '';
    ps.stdout.on('data', (d) => (out += d.toString()));
    ps.on('close', () => {
      let killed = 0;
      const lines = out.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const [name, , createdAtRaw] = line.split('|');
        const createdAt = new Date(createdAtRaw);
        if (isNaN(createdAt.getTime())) continue;
        const ageSec = (Date.now() - createdAt.getTime()) / 1000;
        if (ageSec > maxAgeSec) {
          console.log(`[reaper] killing stale sandbox ${name} (${Math.round(ageSec)}s old)`);
          killContainer(name);
          killed++;
        }
      }
      resolve(killed);
    });
    ps.on('error', () => resolve(0));
  });
}
