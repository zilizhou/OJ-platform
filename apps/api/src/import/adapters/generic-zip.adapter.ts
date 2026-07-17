import AdmZip from 'adm-zip';
import { UpfProblem } from '../upf';

// 通用 ZIP 约定:
//   - 单题包:  problem.json  +  testdata/  (1.in/1.out 或 *.in/*.out 对)
//   - 多题包:  problems/<id>/problem.json + problems/<id>/testdata/
// problem.json 字段同 UpfProblem,但不需要 testcases(从 testdata/ 自动推断)。

interface ProblemJson {
  title: string;
  description: string;
  difficulty?: number;
  timeLimit?: number;
  memoryLimit?: number;
  tags?: string[];
  sourceId?: string;
  samples?: number[]; // 标记哪些测试点作为样例(1-based 序号)
}

function pairTestdata(entries: { name: string; data: Buffer }[]) {
  const inputs = new Map<string, Buffer>();
  const outputs = new Map<string, Buffer>();
  for (const e of entries) {
    const base = e.name.replace(/\.(in|out|ans)$/i, '');
    if (/\.in$/i.test(e.name)) inputs.set(base, e.data);
    else if (/\.(out|ans)$/i.test(e.name)) outputs.set(base, e.data);
  }
  const keys = [...inputs.keys()].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  return keys
    .filter((k) => outputs.has(k))
    .map((k) => ({
      input: inputs.get(k)!.toString('utf-8'),
      expectedOutput: outputs.get(k)!.toString('utf-8'),
    }));
}

function parseSingle(zip: AdmZip, prefix: string): UpfProblem | null {
  const problemEntry = zip.getEntry(`${prefix}problem.json`);
  if (!problemEntry) return null;
  const meta: ProblemJson = JSON.parse(problemEntry.getData().toString('utf-8'));

  const tdPrefix = `${prefix}testdata/`;
  const tdEntries = zip.getEntries()
    .filter((e) => !e.isDirectory && e.entryName.startsWith(tdPrefix))
    .map((e) => ({ name: e.entryName.slice(tdPrefix.length), data: e.getData() }));
  const pairs = pairTestdata(tdEntries);

  const samples = new Set(meta.samples || [1]);
  return {
    title: meta.title,
    description: meta.description,
    difficulty: meta.difficulty,
    timeLimit: meta.timeLimit,
    memoryLimit: meta.memoryLimit,
    tags: meta.tags,
    sourcePlatform: 'generic-zip',
    sourceId: meta.sourceId,
    testcases: pairs.map((p, i) => ({ ...p, isSample: samples.has(i + 1) })),
  };
}

export function parseGenericZip(buffer: Buffer): UpfProblem[] {
  const zip = new AdmZip(buffer);
  const root = parseSingle(zip, '');
  if (root) return [root];

  // 多题:problems/<id>/...
  const ids = new Set<string>();
  for (const e of zip.getEntries()) {
    const m = e.entryName.match(/^problems\/([^\/]+)\//);
    if (m) ids.add(m[1]);
  }
  const result: UpfProblem[] = [];
  for (const id of ids) {
    const p = parseSingle(zip, `problems/${id}/`);
    if (p) {
      p.sourceId = p.sourceId || id;
      result.push(p);
    }
  }
  return result;
}
