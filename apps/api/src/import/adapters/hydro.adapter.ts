import AdmZip from 'adm-zip';
import { UpfProblem } from '../upf';

// Hydro OJ 题包格式(docs.hydro.ac):
//   <root>/<id>/
//     problem.yaml         (pid, owner, title, tag[])
//     problem_zh.md        (题面,带 HTML 标签 + HTML 实体)
//     testdata/
//       config.yaml        (time/memory + type: standard | remote_judge | ...)
//       *.in / *.out       (仅 standard 类型有)
//
// 重要:type=remote_judge 的题目 *只有题面*,Hydro 自己也要靠 hydroac-client
// 转发到远程评测。本地导入只能拿到题面,不能真正评测;给一个 dummy 测试点,
// 题目入库但状态备注"无可用本地测试数据"。

interface HydroMeta {
  pid?: string;
  owner?: number;
  title?: string;
  tag?: string[];
}

interface HydroTdConfig {
  type?: string;          // standard | remote_judge | subjective | ...
  subType?: string;       // 比如 ybtbas
  target?: string;        // remote_judge 的目标
  time?: string;          // "1000ms" / "1s"
  memory?: string;        // "128MB" / "256m"
}

/** 极简 YAML 解析:够用 key:value、嵌套数组(- item)。不引依赖。 */
function parseSimpleYaml(text: string): any {
  const out: any = {};
  let lastKey: string | null = null;
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (/^\s*-\s+/.test(raw) && lastKey) {
      const v = raw.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, '');
      if (!Array.isArray(out[lastKey])) out[lastKey] = [];
      out[lastKey].push(v);
      continue;
    }
    const m = raw.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (!val) { lastKey = key; out[key] = []; continue; }
    val = val.replace(/^["']|["']$/g, '');
    out[key] = /^-?[\d.]+$/.test(val) ? Number(val) : val;
    lastKey = key;
  }
  return out;
}

/** 解 HTML 实体 + 把基本 HTML 标签转成 Markdown,保留可读性 */
function htmlToMarkdown(html: string): string {
  let s = html;
  // 实体解码
  s = s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const named: Record<string, string> = {
    lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ',
  };
  s = s.replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);

  // 块级 HTML → Markdown
  s = s.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/gi, (_, lv, body) =>
    '\n' + '#'.repeat(Number(lv)) + ' ' + body.trim() + '\n');
  // <pre><code class="language-xxx">...</code></pre>
  s = s.replace(
    /<pre>\s*<code(?:\s+class="language-([^"]+)")?>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_, lang, body) => '\n```' + (lang || '') + '\n' + body + '\n```\n',
  );
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, (_, body) => '`' + body + '`');
  s = s.replace(/<strong>([\s\S]*?)<\/strong>/gi, (_, b) => '**' + b + '**');
  s = s.replace(/<em>([\s\S]*?)<\/em>/gi, (_, b) => '*' + b + '*');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<p>([\s\S]*?)<\/p>/gi, (_, b) => '\n' + b.trim() + '\n');
  // 残余 HTML 标签直接去掉
  s = s.replace(/<\/?[a-z][^>]*>/gi, '');
  // 多余空行折叠
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

function parseTimeMs(s: string | number | undefined, fallback = 1000): number {
  if (typeof s === 'number') return s;
  if (!s) return fallback;
  const m = String(s).trim().toLowerCase().match(/^([\d.]+)\s*(ms|s|m)?$/);
  if (!m) return fallback;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return Math.round(n * 1000);
    case 'm': return Math.round(n * 60 * 1000);
    default: return Math.round(n); // ms 或没单位默认 ms
  }
}

function parseMemMb(s: string | number | undefined, fallback = 256): number {
  if (typeof s === 'number') return s;
  if (!s) return fallback;
  const m = String(s).trim().toLowerCase().match(/^([\d.]+)\s*(k|m|g|kb|mb|gb)?$/);
  if (!m) return fallback;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'k': case 'kb': return Math.max(1, Math.round(n / 1024));
    case 'g': case 'gb': return Math.round(n * 1024);
    default: return Math.round(n); // MB
  }
}

function pairTestdata(entries: { name: string; data: Buffer }[]) {
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

function parseSingle(zip: AdmZip, prefix: string): UpfProblem | null {
  const metaEntry = zip.getEntry(`${prefix}problem.yaml`);
  if (!metaEntry) return null;
  const meta = parseSimpleYaml(metaEntry.getData().toString('utf-8')) as HydroMeta;

  // 题面优先 zh,其次 en,其次 problem.md
  const descCandidates = ['problem_zh.md', 'problem_en.md', 'problem.md'];
  let descRaw = '';
  for (const c of descCandidates) {
    const e = zip.getEntry(`${prefix}${c}`);
    if (e) { descRaw = e.getData().toString('utf-8'); break; }
  }

  // testdata/config.yaml
  let td: HydroTdConfig = {};
  const tdCfg = zip.getEntry(`${prefix}testdata/config.yaml`);
  if (tdCfg) td = parseSimpleYaml(tdCfg.getData().toString('utf-8')) as HydroTdConfig;

  const isRemote = td.type && td.type !== 'standard' && td.type !== 'default';
  // 真实测试数据(只在 standard 类型下有意义)
  const tdPrefix = `${prefix}testdata/`;
  const tdEntries = zip.getEntries()
    .filter((e) => !e.isDirectory && e.entryName.startsWith(tdPrefix) && !/config\.yaml$/i.test(e.entryName))
    .map((e) => ({ name: e.entryName.slice(tdPrefix.length), data: e.getData() }));
  const pairs = pairTestdata(tdEntries);

  let testcases = pairs.map((p, i) => ({ ...p, isSample: i === 0 }));
  let description = htmlToMarkdown(descRaw);
  if (isRemote && testcases.length === 0) {
    // remote_judge 类型:题包本身不带测试数据,只能浏览题面
    description = `> ⚠️ **此题为 Hydro \`${td.type}\` 类型 (remote=${td.target || td.subType || '?'}),原题包不含本地测试数据。** 当前仅可浏览题面,提交后会因缺失测试点报错。\n\n` + description;
    testcases = [{ input: '', expectedOutput: '', isSample: true }];
  } else if (testcases.length === 0) {
    testcases = [{ input: '', expectedOutput: '', isSample: true }];
  }

  return {
    title: meta.title || meta.pid || prefix.replace(/\/$/, '') || 'Hydro Problem',
    description,
    timeLimit: parseTimeMs(td.time),
    memoryLimit: parseMemMb(td.memory),
    tags: meta.tag,
    sourcePlatform: 'hydro',
    sourceId: meta.pid || prefix.replace(/\/$/, '').split('/').pop() || undefined,
    testcases,
  };
}

export function parseHydroZip(buffer: Buffer): UpfProblem[] {
  const zip = new AdmZip(buffer);
  // 找所有含 problem.yaml 的目录
  const dirs = new Set<string>();
  for (const e of zip.getEntries()) {
    if (e.entryName.startsWith('__MACOSX/')) continue;
    const m = e.entryName.match(/^(.*?\/)problem\.yaml$/);
    if (m) dirs.add(m[1]);
  }
  const result: UpfProblem[] = [];
  for (const d of dirs) {
    const p = parseSingle(zip, d);
    if (p) result.push(p);
  }
  return result;
}
