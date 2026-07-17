// Unified Problem Format —— 设计文档 §5.1
// 所有导入器先把源格式转成 UPF,再统一写入数据库。

export interface UpfTestcase {
  input: string;
  expectedOutput: string;
  isSample?: boolean;
  score?: number;
}

export interface UpfProblem {
  title: string;
  description: string;       // markdown
  difficulty?: number;       // 1-5
  timeLimit?: number;        // ms
  memoryLimit?: number;      // MB
  tags?: string[];
  sourcePlatform?: string;   // 'fps' / 'generic-zip' / 'luogu' / ...
  sourceId?: string;         // 平台原始题号
  testcases: UpfTestcase[];
}

export interface ValidationError {
  problemTitle: string;
  field: string;
  message: string;
}

export function validateUpf(p: UpfProblem): ValidationError[] {
  const errs: ValidationError[] = [];
  const title = p.title || '<untitled>';
  if (!p.title) errs.push({ problemTitle: title, field: 'title', message: '题目标题不能为空' });
  if (!p.description) errs.push({ problemTitle: title, field: 'description', message: '题面不能为空' });
  if (!p.testcases || p.testcases.length === 0) {
    errs.push({ problemTitle: title, field: 'testcases', message: '至少需要 1 个测试点' });
  } else {
    p.testcases.forEach((t, i) => {
      if (t.expectedOutput === undefined || t.expectedOutput === null) {
        errs.push({ problemTitle: title, field: `testcases[${i}]`, message: '缺少 expectedOutput' });
      }
    });
  }
  if (p.difficulty !== undefined && (p.difficulty < 1 || p.difficulty > 5)) {
    errs.push({ problemTitle: title, field: 'difficulty', message: '难度需在 1-5 之间' });
  }
  return errs;
}
