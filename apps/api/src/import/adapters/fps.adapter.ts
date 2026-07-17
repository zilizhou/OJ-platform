import { XMLParser } from 'fast-xml-parser';
import { UpfProblem } from '../upf';

// Free Problem Set (FPS) XML —— HustOJ/QDUOJ 等常用导出格式。
// 结构: <fps><item><title/><description/><input/><output/><time_limit unit="s"/>
//   <memory_limit unit="mb"/><sample_input/><sample_output/>
//   <test_input/>... <test_output/>... </item></fps>

interface FpsItem {
  title?: string;
  description?: string;
  input?: string;
  output?: string;
  hint?: string;
  source?: string;
  time_limit?: { '#text': string | number; '@_unit'?: string } | string | number;
  memory_limit?: { '#text': string | number; '@_unit'?: string } | string | number;
  sample_input?: string | string[];
  sample_output?: string | string[];
  test_input?: string | string[];
  test_output?: string | string[];
}

function toMs(v: FpsItem['time_limit']): number | undefined {
  if (v == null) return undefined;
  const obj = typeof v === 'object' ? v : { '#text': v };
  const num = Number((obj as any)['#text']);
  const unit = (obj as any)['@_unit'] || 's';
  if (isNaN(num)) return undefined;
  return unit === 'ms' ? num : Math.round(num * 1000);
}

function toMb(v: FpsItem['memory_limit']): number | undefined {
  if (v == null) return undefined;
  const obj = typeof v === 'object' ? v : { '#text': v };
  const num = Number((obj as any)['#text']);
  const unit = (obj as any)['@_unit'] || 'mb';
  if (isNaN(num)) return undefined;
  return unit === 'kb' ? Math.round(num / 1024) : num;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function buildDescription(item: FpsItem): string {
  const parts: string[] = [];
  if (item.description) parts.push(item.description);
  if (item.input) parts.push(`## 输入格式\n\n${item.input}`);
  if (item.output) parts.push(`## 输出格式\n\n${item.output}`);
  if (item.hint) parts.push(`## 提示\n\n${item.hint}`);
  if (item.source) parts.push(`> 来源: ${item.source}`);
  return parts.join('\n\n');
}

export function parseFps(xml: string): UpfProblem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false,
  });
  const root = parser.parse(xml);
  const items: FpsItem[] = asArray(root?.fps?.item);

  return items.map((item, idx) => {
    const samples = asArray(item.sample_input).map((inp, i) => ({
      input: String(inp ?? ''),
      expectedOutput: String(asArray(item.sample_output)[i] ?? ''),
      isSample: true,
    }));
    const tests = asArray(item.test_input).map((inp, i) => ({
      input: String(inp ?? ''),
      expectedOutput: String(asArray(item.test_output)[i] ?? ''),
      isSample: false,
    }));
    return {
      title: item.title || `Problem ${idx + 1}`,
      description: buildDescription(item),
      timeLimit: toMs(item.time_limit),
      memoryLimit: toMb(item.memory_limit),
      sourcePlatform: 'fps',
      sourceId: String(idx + 1),
      testcases: [...samples, ...tests],
    };
  });
}
