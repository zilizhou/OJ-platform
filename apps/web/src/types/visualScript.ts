export type VisualTemplate = 'io-flow' | 'array-sim' | 'dp-table';

export interface VisualScript {
  problemId: number;
  template: VisualTemplate;
  title: string;
  summary: string;
  sampleInput?: string;
  sampleOutput?: string;
  steps: VisualStep[];
}

export interface VisualStep {
  caption: string;
  durationMs?: number;
  payload: IoFlowPayload | ArraySimPayload | DpTablePayload;
}

export type IoFlowPayload =
  | { kind: 'read'; input: string; vars: { name: string; value: string | number }[] }
  | { kind: 'compute'; expr: string; result: string | number }
  | { kind: 'output'; value: string | number }
  | { kind: 'note'; text: string };

export type ArraySimPayload =
  | { kind: 'init'; cells: (string | number)[]; label?: string }
  | { kind: 'highlight'; indices: number[]; cells?: (string | number)[] }
  | { kind: 'swap'; i: number; j: number; cells: (string | number)[] }
  | { kind: 'append'; value: string | number; cells: (string | number)[] }
  | { kind: 'result'; value: string | number }
  | { kind: 'note'; text: string };

export type DpTablePayload =
  | { kind: 'note'; text: string }
  | {
      kind: 'sequences';
      a: (string | number)[];
      b: (string | number)[];
      curI?: number;
      curJ?: number;
      highlightA?: number[];
      highlightB?: number[];
    }
  | {
      kind: 'f-array';
      label: string;
      cells: number[];
      highlight?: number[];
      tValue?: number;
      curI?: number;
    }
  | {
      kind: 'match';
      i: number;
      j: number;
      value: number;
      fVal: number;
      cells: number[];
      tValue?: number;
    }
  | { kind: 'result'; value: number; subsequence?: (string | number)[] };
