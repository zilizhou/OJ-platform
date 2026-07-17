import axios from 'axios';
import { useAuth } from './store';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      useAuth.getState().logout();
    }
    return Promise.reject(err);
  },
);

export interface ProblemSummary {
  id: number;
  title: string;
  difficulty: number;
  tags: string[];
  timeLimit: number;
  memoryLimit: number;
}

export interface ProblemDetail extends ProblemSummary {
  description: string;
  testcases: { id: number; input: string; expectedOutput: string }[];
  acceptanceRate?: number;
  acCount?: number;
  totalCount?: number;
  userHasAccepted?: boolean;
}

export interface SubmissionRow {
  id: number;
  userId: number;
  problemId: number;
  language: string;
  status: string;
  timeUsed: number | null;
  memoryUsed: number | null;
  createdAt: string;
  user: { username: string };
  problem: { title: string };
}

// 判题单测点结果(提交模式:expected 仅样例有;userOutput 用户自己的输出)
export interface CaseDetail {
  status: string;
  timeMs: number;
  memoryKb: number;
  message?: string;
  expected?: string;
  userOutput?: string;
}

// POST /submissions/run 返回(与 judge.ts JudgeResult 同构)
export interface RunResult {
  status: string;
  timeMs: number;
  memoryKb: number;
  message?: string;
  cases: CaseDetail[];
}

// 提交详情(含 detail.cases)
export interface SubmissionFull {
  id: number;
  language: string;
  code: string;
  status: string;
  timeUsed: number | null;
  memoryUsed: number | null;
  detail: { cases?: CaseDetail[]; message?: string; error?: string } | null;
  createdAt: string;
  user: { username: string };
  problem: { title: string };
  queuePosition?: number | null; // Pending 时存在
}
