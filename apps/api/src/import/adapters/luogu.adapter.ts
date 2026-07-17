import AdmZip from 'adm-zip';
import { UpfProblem } from '../upf';

// 洛谷风格题包(社区常见目录约定,不依赖官方 API):
//
//   <pid>/                  ← 题号目录,或 ZIP 根目录
//     problem.md            ← 题面 (markdown)
//     meta.json | meta.yml  ← 元信息(title/time/memory/difficulty/tags)
//     samples/1.in 1.out    ← 样例
//     testdata/1.in 1.out   ← 测试数据
//
// meta.json 字段约定:
//   { title, timeLimit (ms), memoryLimit (mb), difficulty (1-5), tags: [], luoguId }

interface LuoguMeta {
  title?: string;
  timeLimit?: number;   // ms 或 s,数字 < 100 视为秒
  memoryLimit?: number; // mb
  difficulty?: number;
  tags?: string[];
  luoguId?: string;
}

function readEntry(zip: AdmZip, names: string[]): string | null {
  for (const n of names) {
    const e = zip.getEntry(n);
    if (e) return e.getData().toString('utf-8');
  }
  return null;
}

function parseMeta(raw: string | null): LuoguMeta {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // YAML 极简解析: `key: value` 一行一对(不处理嵌套数组)
    const meta: any = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*$/);
      if (!m) continue;
      const v = m[2];
      meta[m[1]] = /^[\d.]+$/.test(v) ? Number(v) : v.replace(/^["']|["']$/g, '');
    }
    return meta;
  }
}

function pair(entries: { name: string; data: Buffer }[]) {
  const inputs = new Map<string, Buffer>();
  const outputs = new Map<string, Buffer>();
  for (const e of entries) {
    const base = e.name.replace(/\.(in|out|ans)$/i, '');
    if (/\.in$/i.test(e.name)) inputs.set(base, e.data);
    else if (/\.(out|ans)$/i.test(e.name)) outputs.set(base, e.data);
  }
  return [...inputs.keys()]
    .sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .filter((k) => outputs.has(k))
    .map((k) => ({
      input: inputs.get(k)!.toString('utf-8'),
      expectedOutput: outputs.get(k)!.toString('utf-8'),
    }));
}

function listUnder(zip: AdmZip, prefix: string) {
  return zip.getEntries()
    .filter((e) => !e.isDirectory && e.entryName.startsWith(prefix))
    .map((e) => ({ name: e.entryName.slice(prefix.length), data: e.getData() }));
}

function parseSingle(zip: AdmZip, prefix: string): UpfProblem | null {
  const desc = readEntry(zip, [`${prefix}problem.md`, `${prefix}description.md`, `${prefix}README.md`]);
  if (!desc) return null;
  const meta = parseMeta(readEntry(zip, [`${prefix}meta.json`, `${prefix}meta.yml`, `${prefix}meta.yaml`]));

  const samples = pair(listUnder(zip, `${prefix}samples/`)).map((p) => ({ ...p, isSample: true }));
  const tests = pair(listUnder(zip, `${prefix}testdata/`)).map((p) => ({ ...p, isSample: false }));

  // 时间限制单位归一化: <100 视为秒,否则毫秒
  let timeLimit = meta.timeLimit;
  if (timeLimit !== undefined && timeLimit < 100) timeLimit = Math.round(timeLimit * 1000);

  return {
    title: meta.title || prefix.replace(/\/$/, '') || 'Luogu Problem',
    description: desc,
    difficulty: meta.difficulty,
    timeLimit,
    memoryLimit: meta.memoryLimit,
    tags: meta.tags,
    sourcePlatform: 'luogu',
    sourceId: String(meta.luoguId || prefix.replace(/\/$/, '') || ''),
    testcases: samples.concat(tests),
  };
}

export function parseLuoguZip(buffer: Buffer): UpfProblem[] {
  const zip = new AdmZip(buffer);
  // 单题:根目录直接有 problem.md
  const root = parseSingle(zip, '');
  if (root) return [root];

  // 多题:扫一级子目录,每个含 problem.md
  const dirs = new Set<string>();
  for (const e of zip.getEntries()) {
    const m = e.entryName.match(/^([^\/]+)\//);
    if (m) dirs.add(m[1]);
  }
  const result: UpfProblem[] = [];
  for (const d of dirs) {
    const p = parseSingle(zip, `${d}/`);
    if (p) {
      if (!p.sourceId) p.sourceId = d;
      result.push(p);
    }
  }
  return result;
}
