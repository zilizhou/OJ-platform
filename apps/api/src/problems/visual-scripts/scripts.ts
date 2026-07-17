import type { VisualScript } from './types';

/** 内置动画脚本库；后续可改为 DB / LLM 生成入库 */
const SCRIPTS: Record<number, VisualScript> = {
  1: {
    problemId: 1,
    template: 'io-flow',
    title: 'A + B 解题动画',
    summary: '读入两个整数，相加后输出。这是最基础的输入→计算→输出流程。',
    sampleInput: '3 5',
    sampleOutput: '8',
    steps: [
      {
        caption: '程序从标准输入读取一行',
        payload: { kind: 'read', input: '3 5', vars: [] },
      },
      {
        caption: '用空格拆分，得到 a = 3，b = 5',
        payload: {
          kind: 'read',
          input: '3 5',
          vars: [
            { name: 'a', value: 3 },
            { name: 'b', value: 5 },
          ],
        },
      },
      {
        caption: '计算 a + b',
        payload: { kind: 'compute', expr: 'a + b = 3 + 5', result: 8 },
      },
      {
        caption: '将结果输出到标准输出',
        payload: { kind: 'output', value: 8 },
      },
      {
        caption: '完成！时间复杂度 O(1)，空间复杂度 O(1)',
        payload: { kind: 'note', text: '只需一次读入、一次加法、一次输出。' },
      },
    ],
  },
  2: {
    problemId: 2,
    template: 'array-sim',
    title: '反转数字 解题动画',
    summary: '把整数 n 的各位拆开，逆序拼接得到反转结果。用数组模拟逐位提取与重组。',
    sampleInput: '12345',
    sampleOutput: '54321',
    steps: [
      {
        caption: '读入整数 n = 12345',
        payload: { kind: 'note', text: '输入：12345' },
      },
      {
        caption: '逐位取出最后一位，放入数组',
        payload: { kind: 'init', cells: ['5'], label: 'digits' },
        durationMs: 1600,
      },
      {
        caption: 'n ← n / 10，取出 4',
        payload: { kind: 'append', value: 4, cells: ['5', '4'] },
      },
      {
        caption: '继续取出 3',
        payload: { kind: 'append', value: 3, cells: ['5', '4', '3'] },
      },
      {
        caption: '取出 2',
        payload: { kind: 'append', value: 2, cells: ['5', '4', '3', '2'] },
      },
      {
        caption: '取出最后一位 1',
        payload: { kind: 'append', value: 1, cells: ['5', '4', '3', '2', '1'] },
      },
      {
        caption: '数组已是逆序排列，拼接得 54321',
        payload: { kind: 'highlight', indices: [0, 1, 2, 3, 4], cells: ['5', '4', '3', '2', '1'] },
      },
      {
        caption: '输出结果',
        payload: { kind: 'result', value: 54321 },
      },
    ],
  },
  540: {
    problemId: 540,
    template: 'dp-table',
    title: '最长公共上升子序列（LCIS）',
    summary:
      '在 A、B 中各选一段下标递增且数值严格递增的公共子序列，求最长长度。经典 O(N²) DP：f[j] 表示以 B[j] 结尾的 LCIS 长度。',
    sampleInput: '4\n2 2 1 3\n2 1 2 3',
    sampleOutput: '2',
    steps: [
      {
        caption: 'LCIS：从 A、B 中各选若干位置，下标递增、数值严格递增，且对应位置数值相等',
        payload: {
          kind: 'note',
          text: '例：A[0]=2 与 B[2]=2 配对，再与 A[3]=3、B[3]=3 配对 → 子序列 2→3，长度 2。',
        },
        durationMs: 2200,
      },
      {
        caption: '读入样例：N=4，A = [2,2,1,3]，B = [2,1,2,3]',
        payload: {
          kind: 'sequences',
          a: [2, 2, 1, 3],
          b: [2, 1, 2, 3],
        },
      },
      {
        caption: '定义 f[j] = 以 B[j] 结尾的最长公共上升子序列长度。按 A 逐行扫描，维护变量 t',
        payload: {
          kind: 'note',
          text: '遍历 A[i] 时，t = max{ f[j] | B[j] < A[i] }。若 A[i]==B[j]，则 f[j] = t + 1。',
        },
        durationMs: 2200,
      },
      {
        caption: 'i=0，A[0]=2。j=0 时 A[0]==B[0]，f[0]=0+1=1',
        payload: {
          kind: 'match',
          i: 0,
          j: 0,
          value: 2,
          fVal: 1,
          tValue: 0,
          cells: [1, 0, 0, 0],
        },
      },
      {
        caption: 'i=0 继续：j=2 时 A[0]==B[2]=2，此时 t=1（来自 B[0]），f[2]=2',
        payload: {
          kind: 'match',
          i: 0,
          j: 2,
          value: 2,
          fVal: 2,
          tValue: 1,
          cells: [1, 0, 2, 0],
        },
        durationMs: 2000,
      },
      {
        caption: 'i=1，A[1]=2（与 i=0 类似，f 数组保持 [1,0,2,0]）',
        payload: {
          kind: 'f-array',
          label: 'f[j]',
          cells: [1, 0, 2, 0],
          curI: 1,
        },
      },
      {
        caption: 'i=2，A[2]=1。j=1 时 A[2]==B[1]=1，f[1]=1',
        payload: {
          kind: 'match',
          i: 2,
          j: 1,
          value: 1,
          fVal: 1,
          tValue: 0,
          cells: [1, 1, 2, 0],
        },
      },
      {
        caption: 'i=3，A[3]=3。扫描中 t 累积到 1，j=3 时 A[3]==B[3]=3，f[3]=2',
        payload: {
          kind: 'match',
          i: 3,
          j: 3,
          value: 3,
          fVal: 2,
          tValue: 1,
          cells: [1, 1, 2, 2],
        },
        durationMs: 2000,
      },
      {
        caption: '答案 = max(f) = 2。对应公共上升子序列：2 → 3',
        payload: {
          kind: 'result',
          value: 2,
          subsequence: [2, 3],
        },
      },
      {
        caption: '提示样例（N=10）答案为 3，算法相同，只是规模更大',
        payload: {
          kind: 'note',
          text: '时间复杂度 O(N²)，N≤3000 可接受。核心：双序列 DP + 维护 t 前缀最优。',
        },
      },
    ],
  },
};

export function getVisualScript(problemId: number): VisualScript | null {
  return SCRIPTS[problemId] ?? null;
}
