import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Col, Row, Select, Button, message, Space, Tag, Tabs, Input, Tooltip,
  Typography, Divider, Alert, Drawer,
} from 'antd';
import type { TabsProps } from 'antd';
import {
  StarOutlined, StarFilled, LikeOutlined, DislikeOutlined,
  PlayCircleOutlined, CheckCircleOutlined, HistoryOutlined, SolutionOutlined,
  FileTextOutlined, PlusOutlined, CloseOutlined, DownOutlined, UpOutlined,
  VideoCameraOutlined, RightOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import Markdown from '../components/Markdown';
import VisualSolutionPlayer from '../components/VisualSolutionPlayer';
import SubmissionDetailPanel from '../components/SubmissionDetailPanel';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ProblemDetail as PD, RunResult, SubmissionRow, CaseDetail } from '../api';
import type { VisualScript } from '../types/visualScript';
import { useAuth, useTheme, useProblemBank } from '../store';
import './problem-detail.css';

// 单个测试用例:输入 + (可选)期望输出;留空期望时只看 stdout 不判 WA/AC
interface TestCaseItem {
  input: string;
  expected: string;
}

interface RunCaseResult {
  status: string;
  timeMs: number;
  memoryKb: number;
  message?: string;
  caseResult: CaseDetail;
}

interface EditorialRow {
  id: number;
  title: string;
  kind: 'DISCUSSION' | 'EDITORIAL';
  pinned?: boolean;
  createdAt: string;
  author: { id: number; username: string };
  _count: { comments: number };
  excerpt?: string;
  languages?: string[];
}

const LANG_OPTIONS = [
  { value: 'cpp', label: 'C++ 17' },
  { value: 'python', label: 'Python 3' },
  { value: 'java', label: 'Java 21' },
  { value: 'javascript', label: 'JavaScript (Node 20)' },
];

const DEFAULT_CODE: Record<string, string> = {
  cpp: '#include <iostream>\nusing namespace std;\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b << endl;\n    return 0;\n}\n',
  python: 'a, b = map(int, input().split())\nprint(a + b)\n',
  java: 'import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int a = sc.nextInt(), b = sc.nextInt();\n        System.out.println(a + b);\n    }\n}\n',
  javascript: "const data = require('fs').readFileSync(0, 'utf-8').trim().split(/\\s+/).map(Number);\nconsole.log(data[0] + data[1]);\n",
};

const MONACO_LANG: Record<string, string> = {
  cpp: 'cpp', python: 'python', java: 'java', javascript: 'javascript',
};

// 1-5 难度映射到 LeetCode 三档全大写
const DIFF_META: Record<number, { label: string; color: string; text: string }> = {
  1: { label: 'EASY',   color: '#00af9b', text: '简单' },
  2: { label: 'MEDIUM', color: '#ffb800', text: '中等' },
  3: { label: 'MEDIUM', color: '#ffb800', text: '中等' },
  4: { label: 'HARD',   color: '#ff375f', text: '困难' },
  5: { label: 'HARD',   color: '#ff375f', text: '困难' },
};

const STATUS_COLOR: Record<string, string> = {
  AC: 'success', WA: 'error', TLE: 'warning', MLE: 'warning', OLE: 'warning',
  RE: 'error', CE: 'error', SE: 'magenta',
};

const STATUS_TITLE: Record<string, string> = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  TLE: 'Time Limit Exceeded',
  MLE: 'Memory Limit Exceeded',
  OLE: 'Output Limit Exceeded',
  RE: 'Runtime Error',
  CE: 'Compile Error',
  SE: 'System Error',
};

const SUB_STATUS_COLOR: Record<string, string> = {
  AC: 'success', WA: 'error', TLE: 'warning', MLE: 'warning', RE: 'error',
  CE: 'error', OLE: 'warning', SE: 'magenta', Pending: 'default', Judging: 'processing',
};

type DraftMap = Record<string, string>;

function loadDrafts(): DraftMap {
  try { return JSON.parse(localStorage.getItem('oj-drafts') || '{}'); } catch { return {}; }
}
function saveDraft(pid: number, lang: string, code: string) {
  const d = loadDrafts();
  d[`${pid}:${lang}`] = code;
  localStorage.setItem('oj-drafts', JSON.stringify(d));
}
function loadLastLang(pid: number): string {
  return localStorage.getItem(`oj-lastlang-${pid}`) || 'cpp';
}

/** 在 markdown 描述里识别"示例/样例"小标题,切分成 [前言, 示例段, ...] 段;并剥离"数据范围/提示/Constraints"。 */
interface ParsedDesc {
  prelude: string;       // 示例前的题面正文
  examples: string[];    // 各示例段(svg 块含 `### 示例 1` 等)
  constraints: string | null; // 数据范围/提示/Constraints 段
}
function parseDescription(md: string): ParsedDesc {
  const lines = md.split('\n');
  const prelude: string[] = [];
  const examples: string[] = [];
  const constraints: string[] = [];
  let buf = prelude;
  let collectConstraint = false;

  const isExampleHead = (s: string) =>
    /^\s*(#{1,4}\s*)?(\*{1,2}|【)?\s*(示例|样例|Example)\s*[\d一二三四五六]?/i.test(s);
  const isConstraintHead = (s: string) =>
    /^\s*(#{1,4}\s*)?(\*{1,2}|【)?\s*(数据范围|提示|限制|约束|Constraints?)[\】\*]{0,3}\s*:?\s*$/i.test(s);

  for (const line of lines) {
    if (isExampleHead(line)) {
      buf = [];
      examples.push('');
      // 在 examples 数组里追加,用一个 marker 指向最后一项
      continue;
    }
    if (isConstraintHead(line)) {
      collectConstraint = true;
      buf = constraints;
      continue;
    }
    if (collectConstraint) buf = constraints;
    else if (examples.length > 0) buf = prelude; // 注意,不在示例模式后回到 prelude
    else buf = prelude;

    if (examples.length > 0 && !collectConstraint) {
      examples[examples.length - 1] += (line ? line + '\n' : '');
    } else if (collectConstraint) {
      constraints.push(line);
    } else {
      prelude.push(line);
    }
  }

  return {
    prelude: prelude.join('\n').trim(),
    examples: examples.map((s) => s.trim()).filter(Boolean),
    constraints: constraints.length ? constraints.join('\n').trim() : null,
  };
}

export default function ProblemDetail() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const contestId = search.get('contestId') ? Number(search.get('contestId')) : undefined;
  const [problem, setProblem] = useState<PD>();
  const [language, setLanguage] = useState(() => (id ? loadLastLang(Number(id)) : 'cpp'));
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResultsByCase, setRunResultsByCase] = useState<Record<number, RunCaseResult>>({});
  // 本地多用例:每个用例 = { input, expected }
  const [testcases, setTestcases] = useState<TestCaseItem[]>([{ input: '', expected: '' }]);
  const [activeCase, setActiveCase] = useState(0);
  const [leftTab, setLeftTab] = useState<'desc' | 'visual' | 'solutions' | 'submissions'>('desc');
  const [visualScript, setVisualScript] = useState<VisualScript | null>(null);
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualTried, setVisualTried] = useState(false);
  const [editorials, setEditorials] = useState<EditorialRow[]>([]);
  const [edQ, setEdQ] = useState('');
  const [edLang, setEdLang] = useState<string | undefined>();
  const [edSort, setEdSort] = useState<'time' | 'comments'>('time');
  const [edLoading, setEdLoading] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [saved, setSaved] = useState(true);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [fav, setFav] = useState(false);
  const [like, setLike] = useState<0 | 1 | 2>(0);
  const [history, setHistory] = useState<SubmissionRow[]>([]);
  const [latestSubmission, setLatestSubmission] = useState<SubmissionRow | null>(null);
  const [submitDrawerOpen, setSubmitDrawerOpen] = useState(false);
  const [submitResultId, setSubmitResultId] = useState<number | null>(null);
  const { token, user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const setProblemBankOpen = useProblemBank((s) => s.setOpen);

  useEffect(() => {
    api.get<PD>(`/problems/${id}`).then((r) => {
      setProblem(r.data);
      // 没有自定义测试用例时,默认用题目样例填入用例 1/2...
      const samples = r.data.testcases ?? [];
      if (samples.length > 0) {
        setTestcases(samples.map((t) => ({ input: t.input, expected: t.expectedOutput })));
      } else {
        setTestcases([{ input: '', expected: '' }]);
      }
      setActiveCase(0);
    });
    setRunResultsByCase({});
    setVisualScript(null);
    setVisualTried(false);
    setLeftTab('desc');
    setLatestSubmission(null);
    setSubmitDrawerOpen(false);
    setSubmitResultId(null);
  }, [id]);

  useEffect(() => {
    if (!token || !id || !user) return;
    loadLatestSubmission();
  }, [id, token, user?.id]);

  const openSubmissionDrawer = (submissionId: number) => {
    setSubmitResultId(submissionId);
    setSubmitDrawerOpen(true);
  };

  const loadLatestSubmission = () => {
    if (!user || !id) return;
    api.get<SubmissionRow[]>('/submissions', { params: { problemId: id, userId: user.id, limit: 1 } })
      .then((r) => setLatestSubmission(r.data[0] ?? null))
      .catch(() => setLatestSubmission(null));
  };

  useEffect(() => {
    if (id) setFav(localStorage.getItem(`oj-fav-${id}`) === '1');
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const drafts = loadDrafts();
    const saved = drafts[`${id}:${language}`];
    setCode(saved !== undefined ? saved : (DEFAULT_CODE[language] || ''));
    localStorage.setItem(`oj-lastlang-${id}`, language);
  }, [id, language]);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const onCodeChange = (v: string | undefined) => {
    const next = v || '';
    setCode(next);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (id) saveDraft(Number(id), language, next);
      setSaved(true);
    }, 600);
  };

  const loadEditorials = () => {
    if (!id) return;
    setEdLoading(true);
    const params: any = { problemId: id, kind: 'EDITORIAL', sortBy: edSort };
    if (edQ) params.q = edQ;
    api.get<EditorialRow[]>(`/posts`, { params })
      .then((r) => setEditorials(r.data))
      .catch(() => setEditorials([]))
      .finally(() => setEdLoading(false));
  };

  const loadVisual = () => {
    if (!id) return;
    setVisualLoading(true);
    api.get<VisualScript>(`/problems/${id}/visual-solution`)
      .then((r) => setVisualScript(r.data))
      .catch(() => setVisualScript(null))
      .finally(() => { setVisualLoading(false); setVisualTried(true); });
  };

  // 题解搜索/排序变化时自动重拉(仅在 solutions tab 已被打开过)
  useEffect(() => {
    if (leftTab === 'solutions') loadEditorials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edQ, edSort]);

  // 客户端按语言过滤(后端已识别 languages)
  const filteredEditorials = useMemo(() => {
    if (!edLang) return editorials;
    return editorials.filter((p) => p.languages?.includes(edLang));
  }, [editorials, edLang]);

  // 收集本题题解里出现过的语言,作筛选芯片
  const availableLangs = useMemo(() => {
    const set = new Set<string>();
    for (const p of editorials) for (const l of p.languages ?? []) set.add(l);
    return [...set].sort();
  }, [editorials]);

  const submit = async () => {
    if (!token) { message.warning('请先登录'); navigate('/login'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post('/submissions', {
        problemId: Number(id), language, code, contestId,
      });
      message.success('提交成功');
      setSubmitResultId(data.id);
      setSubmitDrawerOpen(true);
      loadLatestSubmission();
      if (leftTab === 'submissions') loadHistory();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '提交失败');
    } finally { setSubmitting(false); }
  };

  const run = async () => {
    if (!token) { message.warning('请先登录'); navigate('/login'); return; }
    const cur = testcases[activeCase] ?? testcases.find((t) => t.input) ?? { input: '', expected: '' };
    if (!cur.input) {
      message.warning('请先在「测试用例」Tab 输入数据再运行');
      return;
    }
    setRunning(true);
    setConsoleOpen(true);
    try {
      const { data } = await api.post<RunResult>('/submissions/run', {
        problemId: Number(id), language, code,
        customInput: cur.input,
        customExpected: cur.expected,
      });
      setRunResultsByCase((prev) => ({
        ...prev,
        [activeCase]: {
          status: data.status,
          timeMs: data.timeMs,
          memoryKb: data.memoryKb,
          message: data.message,
          caseResult: data.cases[0] ?? {
            status: data.status,
            timeMs: data.timeMs,
            memoryKb: data.memoryKb,
            message: data.message,
          },
        },
      }));
    } catch (e: any) {
      message.error(e?.response?.data?.message || '运行失败');
    } finally { setRunning(false); }
  };

  const loadHistory = () => {
    if (!user || !id) return;
    api.get<SubmissionRow[]>('/submissions', { params: { problemId: id, userId: user.id, limit: 30 } })
      .then((r) => setHistory(r.data))
      .catch(() => {});
  };

  const diffMeta = problem ? DIFF_META[problem.difficulty] ?? DIFF_META[1] : DIFF_META[1];

  const parsedDesc = useMemo(
    () => (problem ? parseDescription(problem.description) : null),
    [problem],
  );

  const toggleFav = () => {
    const next = !fav;
    setFav(next);
    if (id) localStorage.setItem(`oj-fav-${id}`, next ? '1' : '0');
  };

  // 多用例操作
  const addCase = () => {
    setTestcases((t) => [...t, { input: '', expected: '' }]);
    setActiveCase(testcases.length);
  };
  const removeCase = (i: number) => {
    if (testcases.length <= 1) {
      setTestcases([{ input: '', expected: '' }]);
      setActiveCase(0);
      setRunResultsByCase({});
      return;
    }
    setTestcases((t) => t.filter((_, idx) => idx !== i));
    setActiveCase((a) => (a >= i && a > 0 ? a - 1 : a));
    setRunResultsByCase((prev) => {
      const next: Record<number, RunCaseResult> = {};
      for (const [k, v] of Object.entries(prev)) {
        const idx = Number(k);
        if (idx < i) next[idx] = v;
        else if (idx > i) next[idx - 1] = v;
      }
      return next;
    });
  };
  const updateCase = (i: number, patch: Partial<TestCaseItem>) => {
    setTestcases((t) => t.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  };

  if (!problem) return null;

  const activeRun = runResultsByCase[activeCase];

  const leftTabItems: TabsProps['items'] = [
    {
      key: 'desc',
      label: <span><FileTextOutlined />{' '}题目描述</span>,
      children: (
        <div style={{ padding: '0 8px 16px 8px' }}>
          {/* LeetCode 风元信息:难度/通过率/标签 inline */}
          <Space style={{ marginBottom: 14 }} size={4} wrap>
            <span
              style={{
                fontSize: 12, fontWeight: 600, color: diffMeta.color,
                border: `1px solid ${diffMeta.color}`, borderRadius: 10,
                padding: '0 10px', lineHeight: '20px',
              }}
            >
              {diffMeta.text} · {diffMeta.label}
            </span>
            {problem.acceptanceRate !== undefined && (
              <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                通过率 {(problem.acceptanceRate * 100).toFixed(1)}%
              </span>
            )}
            <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
              · 时限 {problem.timeLimit}ms
            </span>
            <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
              · 内存 {problem.memoryLimit}MB
            </span>
          </Space>

          <Markdown>{parsedDesc?.prelude || problem.description}</Markdown>

          {/* LeetCode 风示例卡片(占用例段或题目自带 sample testcases) */}
          {(() => {
            const examples = parsedDesc?.examples?.length
              ? parsedDesc.examples
              : (problem.testcases ?? []).map(
                  (t, i) => `**示例 ${i + 1}**\n\n**输入:**\n\`\`\`\n${t.input}\n\`\`\`\n\n**输出:**\n\`\`\`\n${t.expectedOutput}\n\`\`\``,
                );
            if (!examples.length) return null;
            return (
              <>
                {examples.map((ex, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid var(--ant-color-border)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      marginBottom: 10,
                      background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      示例 {i + 1}:
                    </div>
                    <Markdown>{ex}</Markdown>
                  </div>
                ))}
              </>
            );
          })()}

          {/* 数据范围 / 提示 / Constraints */}
          {parsedDesc?.constraints && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>提示</div>
              <Markdown>{parsedDesc.constraints}</Markdown>
            </>
          )}

          {/* Tags */}
          {problem.tags?.length > 0 && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>标签</div>
              <Space wrap size={[6, 6]}>
                {problem.tags.map((t) => (
                  <Tag key={t} style={{ borderRadius: 12, margin: 0 }}>{t}</Tag>
                ))}
              </Space>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'visual',
      label: <span><VideoCameraOutlined />{' '}动画讲解</span>,
      disabled: !!contestId,
      children: contestId ? (
        <div style={{ padding: '0 8px 16px 8px' }}>
          <Alert message="比赛中暂不显示动画讲解" type="info" showIcon />
        </div>
      ) : (
        <div style={{ padding: '0 8px 16px 8px' }}>
          {visualLoading && <Alert message="加载动画讲解…" type="info" showIcon style={{ marginBottom: 12 }} />}
          {!visualLoading && visualTried && !visualScript && (
            <Alert
              message="本题暂无动画讲解"
              description="后续将通过大模型自动生成，敬请期待。"
              type="info"
              showIcon
            />
          )}
          {visualScript && <VisualSolutionPlayer script={visualScript} />}
        </div>
      ),
    },
    {
      key: 'solutions',
      label: <span><SolutionOutlined />{' '}题解</span>,
      disabled: !!contestId,
      children: contestId ? (
        <div style={{ padding: '0 8px 16px 8px' }}>
          <Alert message="比赛中暂不显示题解" type="info" showIcon />
        </div>
      ) : (
        <EditorialPanel
          problemId={problem.id}
          rows={filteredEditorials}
          loading={edLoading}
          q={edQ} setQ={setEdQ}
          sort={edSort} setSort={setEdSort}
          activeLang={edLang} setActiveLang={setEdLang}
          langs={availableLangs}
          canPublish={!!token && !!problem.userHasAccepted}
          isLoggedIn={!!token}
        />
      ),
    },
    {
      key: 'submissions',
      label: <span><HistoryOutlined />{' '}提交记录</span>,
      children: (
        <div style={{ padding: '0 8px 16px 8px' }}>
          {!token ? (
            <Alert message="登录后查看本人提交历史" type="info" showIcon />
          ) : (
            <SubmissionHistory rows={history} onSelect={openSubmissionDrawer} />
          )}
        </div>
      ),
    },
  ];

  const panelHeight = 'calc(100vh - 112px)';

  return (
    <Row
      gutter={12}
      wrap={false}
      style={{ height: panelHeight, maxHeight: panelHeight, overflow: 'hidden' }}
    >
      {/* 左栏:题面 / 提交记录 / 题解（独立滚动，不影响右侧高度） */}
      <Col span={11} style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <Card
          size="small"
          style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          styles={{ body: { padding: 0, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
          title={
            <Space size={6}>
              <Typography.Link
                style={{ fontSize: 13, color: 'var(--ant-color-text-secondary)' }}
                onClick={() => setProblemBankOpen(true)}
              >
                题库 <RightOutlined style={{ fontSize: 10 }} />
              </Typography.Link>
              <Typography.Text style={{ fontSize: 15, fontWeight: 600, color: 'var(--ant-color-text)' }}>
                {problem.id}. {problem.title}
              </Typography.Text>
            </Space>
          }
          extra={
            <Space size={2}>
              <Tooltip title={fav ? '取消收藏' : '收藏'}>
                <Button
                  size="small" type="text"
                  icon={fav ? <StarFilled style={{ color: '#ffc53d' }} /> : <StarOutlined />}
                  onClick={toggleFav}
                />
              </Tooltip>
              <Tooltip title="赞">
                <Button
                  size="small" type="text"
                  icon={<LikeOutlined style={{ color: like === 1 ? '#00af9b' : undefined, fontSize: 14 }} />}
                  onClick={() => setLike(like === 1 ? 0 : 1)}
                />
              </Tooltip>
              <Tooltip title="踩">
                <Button
                  size="small" type="text"
                  icon={<DislikeOutlined style={{ color: like === 2 ? '#ef3b3b' : undefined, fontSize: 14 }} />}
                  onClick={() => setLike(like === 2 ? 0 : 2)}
                />
              </Tooltip>
            </Space>
          }
        >
          <Tabs
            size="small"
            activeKey={leftTab}
            onChange={(k) => {
              if (k === 'submissions') { setLeftTab('submissions'); loadHistory(); }
              else if (k === 'solutions') { setLeftTab('solutions'); loadEditorials(); }
              else if (k === 'visual') { setLeftTab('visual'); if (!visualTried) loadVisual(); }
              else setLeftTab(k as any);
            }}
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingLeft: 12, paddingRight: 12 }}
            className="problem-detail-left-tabs"
            items={leftTabItems}
          />
        </Card>
      </Col>

      {/* 右栏:编辑器 + 控制台（高度固定为视口，不受左侧内容影响） */}
      <Col span={13} style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <Card
          size="small"
          style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          styles={{ body: { padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
          title={
            <Select
              size="small" value={language} onChange={setLanguage}
              options={LANG_OPTIONS} style={{ width: 160 }}
            />
          }
          extra={
            <Space>
              <Button
                size="small" type="primary"
                icon={<CheckCircleOutlined />}
                loading={submitting} onClick={submit}
              >提交答案</Button>
              {token && latestSubmission && (
                <Tooltip title={`查看最近一次提交（#${latestSubmission.id}）`}>
                  <Tag
                    color={SUB_STATUS_COLOR[latestSubmission.status] || 'default'}
                    style={{ margin: 0, cursor: 'pointer', lineHeight: '22px', padding: '0 10px' }}
                    onClick={() => openSubmissionDrawer(latestSubmission.id)}
                  >
                    {latestSubmission.status}
                  </Tag>
                </Tooltip>
              )}
            </Space>
          }
        >
          {/* 编辑器:固定占剩余空间的 50-60% */}
          <div style={{ flex: consoleOpen ? '1 1 55%' : '1 1 100%', minHeight: 0, transition: 'flex 0.18s' }}>
            <Editor
              height="100%"
              language={MONACO_LANG[language] || 'plaintext'}
              theme={theme === 'dark' ? 'vs-dark' : 'vs'}
              value={code}
              onChange={onCodeChange}
              onMount={(editor) => {
                editor.onDidChangeCursorPosition((e) => {
                  setCursorPos({ line: e.position.lineNumber, col: e.position.column });
                });
              }}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, fontFamily: 'Menlo, Consolas, monospace' }}
            />
          </div>

          {/* 编辑器状态栏: 已存储 + 行列 */}
          <div
            style={{
              flex: '0 0 auto',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '3px 12px',
              fontSize: 11,
              color: 'var(--ant-color-text-tertiary)',
              borderTop: '1px solid var(--ant-color-border)',
              background: 'var(--ant-color-fill-quaternary)',
            }}
          >
            <span>{saved ? '已存储' : '未保存…'}</span>
            <span>行 {cursorPos.line}, 列 {cursorPos.col}</span>
          </div>

          {/* 控制台(console) */}
          <div style={{ flex: '0 0 auto', borderTop: '1px solid var(--ant-color-border)' }}>
            {/* 控制台头:展开/折叠 + Tab 切换 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px 0 12px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ant-color-text)' }}>
                <PlayCircleOutlined style={{ marginRight: 6 }} />
                测试用例
              </span>
              <Button
                size="small" type="text"
                icon={consoleOpen ? <DownOutlined /> : <UpOutlined />}
                onClick={() => setConsoleOpen(!consoleOpen)}
              />
            </div>

            {consoleOpen && (
              <div style={{ padding: '8px 12px 12px 12px' }}>
                {/* 用例芯片切换行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  {testcases.map((tc, i) => {
                    const caseRun = runResultsByCase[i];
                    return (
                      <div
                        key={i}
                        onClick={() => setActiveCase(i)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 10px',
                          fontSize: 13, lineHeight: '22px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          userSelect: 'none',
                          border: activeCase === i
                            ? '1px solid #1a73e8'
                            : `1px solid var(--ant-color-border)`,
                          background: activeCase === i
                            ? 'rgba(26,115,232,0.10)'
                            : 'transparent',
                          color: !tc.input && !tc.expected
                            ? 'var(--ant-color-text-tertiary)'
                            : 'var(--ant-color-text)',
                        }}
                      >
                        <span>用例 {i + 1}</span>
                        {caseRun && (
                          <Tag
                            color={STATUS_COLOR[caseRun.status] || 'default'}
                            style={{ margin: 0, lineHeight: '16px', fontSize: 10, padding: '0 4px' }}
                          >
                            {caseRun.status}
                          </Tag>
                        )}
                        {!tc.input && !tc.expected && (
                          <span style={{ fontSize: 10, color: 'var(--ant-color-text-tertiary)' }}>(空)</span>
                        )}
                        {testcases.length > 1 && (
                          <CloseOutlined
                            onClick={(e) => { e.stopPropagation(); removeCase(i); }}
                            style={{ fontSize: 10, color: 'var(--ant-color-text-tertiary)' }}
                          />
                        )}
                      </div>
                    );
                  })}
                  <Button
                    size="small" type="dashed"
                    icon={<PlusOutlined />}
                    onClick={addCase}
                    style={{ height: 26 }}
                  >
                    添加用例
                  </Button>
                  {problem.testcases && problem.testcases.length > 0 && (
                    <Tooltip title="一键把题目自带样例(含期望输出)填入各用例,覆盖当前内容">
                      <Button
                        size="small" type="link"
                        icon={<FileTextOutlined />}
                        onClick={() => {
                          const samples = problem.testcases?.map((t) => ({
                            input: t.input,
                            expected: t.expectedOutput,
                          })) ?? [];
                          if (samples.length > 0) { setTestcases(samples); setActiveCase(0); }
                        }}
                        style={{ height: 26, padding: '0 4px' }}
                      >
                        用样例填充
                      </Button>
                    </Tooltip>
                  )}
                </div>

                {activeRun?.message && (
                  <Alert
                    type="error"
                    showIcon
                    message="编译/运行信息"
                    description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{activeRun.message}</pre>}
                    style={{ marginBottom: 10 }}
                  />
                )}

                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                      标准输入 (stdin)
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>必填</span>
                  </div>
                  <Input.TextArea
                    value={testcases[activeCase]?.input ?? ''}
                    onChange={(e) => updateCase(activeCase, { input: e.target.value })}
                    placeholder={'程序将接收的输入…\n\n示例:\n  1 2'}
                    autoSize={{ minRows: 3, maxRows: 8 }}
                    style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 13 }}
                  />
                </div>

                {/* 期望输出 vs 实际输出 并排对比 */}
                <Row gutter={8}>
                  <Col span={12}>
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                        期望输出
                      </span>
                    </div>
                    <Input.TextArea
                      value={testcases[activeCase]?.expected ?? ''}
                      onChange={(e) => updateCase(activeCase, { expected: e.target.value })}
                      placeholder={'期望程序输出的内容…'}
                      autoSize={{ minRows: 5, maxRows: 12 }}
                      style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 13 }}
                    />
                  </Col>
                  <Col span={12}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                      <Space size={6} wrap style={{ minWidth: 0 }}>
                        <span style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
                          实际输出
                        </span>
                        {running ? (
                          <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>运行中…</span>
                        ) : activeRun ? (
                          <>
                            <Tag color={STATUS_COLOR[activeRun.status]} style={{ margin: 0, lineHeight: '18px' }}>
                              {STATUS_TITLE[activeRun.status] || activeRun.status}
                            </Tag>
                            <span style={{ fontSize: 11, color: 'var(--ant-color-text-secondary)', whiteSpace: 'nowrap' }}>
                              {activeRun.timeMs}ms · {activeRun.memoryKb ? `${Math.round(activeRun.memoryKb / 1024)}MB` : '-'}
                            </span>
                          </>
                        ) : null}
                      </Space>
                      <Button
                        size="small"
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        loading={running}
                        onClick={run}
                      >
                        运行
                      </Button>
                    </div>
                    <Input.TextArea
                      readOnly
                      value={
                        running
                          ? ''
                          : (activeRun?.caseResult.userOutput
                            ?? activeRun?.caseResult.message
                            ?? '')
                      }
                      placeholder={running ? '运行中…' : '运行后在此显示程序输出'}
                      autoSize={{ minRows: 5, maxRows: 12 }}
                      style={{
                        fontFamily: 'Menlo, Consolas, monospace',
                        fontSize: 13,
                        background: 'var(--ant-color-fill-quaternary)',
                        borderColor: activeRun?.caseResult.status === 'AC'
                          ? '#00af9b'
                          : activeRun && activeRun.caseResult.status !== 'AC'
                            ? '#ff7875'
                            : undefined,
                      }}
                    />
                  </Col>
                </Row>
              </div>
            )}
          </div>
        </Card>
      </Col>

      <Drawer
        title={submitResultId ? `提交结果 #${submitResultId}` : '提交结果'}
        placement="right"
        width={560}
        open={submitDrawerOpen}
        onClose={() => setSubmitDrawerOpen(false)}
        destroyOnClose
        extra={
          submitResultId ? (
            <Link to={`/submissions/${submitResultId}`}>在新页打开</Link>
          ) : null
        }
      >
        {submitResultId && <SubmissionDetailPanel submissionId={submitResultId} />}
      </Drawer>
    </Row>
  );
}

function EditorialPanel(props: {
  problemId: number;
  rows: EditorialRow[];
  loading: boolean;
  q: string; setQ: (v: string) => void;
  sort: 'time' | 'comments'; setSort: (v: 'time' | 'comments') => void;
  activeLang: string | undefined; setActiveLang: (v: string | undefined) => void;
  langs: string[];
  canPublish: boolean;
  isLoggedIn: boolean;
}) {
  const { problemId, rows, loading, q, setQ, sort, setSort, activeLang, setActiveLang, langs, canPublish, isLoggedIn } = props;
  const navigate = useNavigate();
  // 简单生成色板用作头像底色
  const avatarBg = (name: string) => {
    const palette = ['#1677ff', '#13c2c2', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#fa541c'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    return palette[Math.abs(h) % palette.length];
  };

  return (
    <div style={{ padding: '0 4px 16px 4px' }}>
      {/* 搜索 + 排序 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 4px 10px 4px' }}>
        <Input.Search
          allowClear
          placeholder="搜索题解"
          size="small"
          value={q}
          onChange={(e) => !e.target.value && setQ('')}
          onSearch={setQ}
          style={{ flex: 1 }}
        />
        <Tooltip title={sort === 'time' ? '按时间(新)' : '按热度(评论多)'}>
          <Button
            size="small"
            onClick={() => setSort(sort === 'time' ? 'comments' : 'time')}
          >
            {sort === 'time' ? '排序: 时间' : '排序: 热度'}
          </Button>
        </Tooltip>
      </div>

      {/* 语言筛选芯片(只在有题解时显示) */}
      {(langs.length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 4px 10px 4px' }}>
          <Chip active={!activeLang} onClick={() => setActiveLang(undefined)}>不限</Chip>
          {langs.map((l) => (
            <Chip key={l} active={activeLang === l} onClick={() => setActiveLang(l === activeLang ? undefined : l)}>
              {l}
            </Chip>
          ))}
        </div>
      )}

      {/* 发布题解 gating bar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', marginBottom: 10,
          background: canPublish ? 'var(--ant-color-success-bg)' : 'var(--ant-color-fill-tertiary)',
          border: `1px dashed ${canPublish ? 'var(--ant-color-success-border)' : 'var(--ant-color-border)'}`,
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        <Space>
          <PlusOutlined style={{ color: canPublish ? '#52c41a' : 'var(--ant-color-text-tertiary)' }} />
          <span style={{ color: canPublish ? 'var(--ant-color-text)' : 'var(--ant-color-text-secondary)' }}>
            {!isLoggedIn
              ? '登录后可发布题解'
              : canPublish
                ? '你已通过本题,可发布题解'
                : '你需要先通过这道题目才能发布题解'}
          </span>
        </Space>
        <Button
          type="primary" size="small"
          disabled={!canPublish}
          icon={<PlusOutlined />}
          onClick={() => navigate(`/problems/${problemId}/posts/new?kind=EDITORIAL`)}
        >
          发布题解
        </Button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ant-color-text-tertiary)' }}>加载中…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ant-color-text-tertiary)' }}>
          {q || activeLang ? '没有匹配的题解' : '还没有题解,做第一个发题解的人吧'}
        </div>
      ) : (
        rows.map((p) => (
          <Link
            key={p.id}
            to={`/posts/${p.id}`}
            style={{
              display: 'block', padding: '12px 8px',
              borderBottom: '1px solid var(--ant-color-border-secondary)',
              color: 'var(--ant-color-text)',
            }}
          >
            {/* 作者 行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div
                style={{
                  width: 24, height: 24, borderRadius: 12,
                  background: avatarBg(p.author.username),
                  color: '#fff', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {p.author.username.slice(0, 1).toUpperCase()}
              </div>
              <span style={{ fontSize: 13, color: 'var(--ant-color-text-secondary)' }}>{p.author.username}</span>
              {p.pinned && <Tag color="red" style={{ marginLeft: 0, lineHeight: '18px' }}>置顶</Tag>}
            </div>

            {/* 标题 */}
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {p.title}
              {p.pinned && <Tag color="green" style={{ marginLeft: 6, lineHeight: '16px' }}>精选</Tag>}
            </div>

            {/* 摘要 */}
            {p.excerpt && (
              <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 6, lineHeight: 1.6 }}>
                {p.excerpt}
              </div>
            )}

            {/* 语言 + 统计 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={4} wrap>
                {(p.languages ?? []).slice(0, 4).map((l) => (
                  <Tag key={l} style={{ borderRadius: 10, fontSize: 11, lineHeight: '18px' }}>{l}</Tag>
                ))}
                {(p.languages?.length ?? 0) > 4 && (
                  <span style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)' }}>+{p.languages!.length - 4}</span>
                )}
              </Space>
              <Space size={12} style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
                <span>💬 {p._count.comments}</span>
                <span>{new Date(p.createdAt).toLocaleDateString()}</span>
              </Space>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 12px',
        fontSize: 12, lineHeight: '20px',
        borderRadius: 12,
        cursor: 'pointer',
        userSelect: 'none',
        border: active ? '1px solid #1677ff' : '1px solid var(--ant-color-border)',
        background: active ? 'rgba(22,119,255,0.1)' : 'transparent',
        color: active ? '#1677ff' : 'var(--ant-color-text-secondary)',
      }}
    >
      {children}
    </span>
  );
}

function SubmissionHistory({ rows, onSelect }: { rows: SubmissionRow[]; onSelect: (id: number) => void }) {
  if (rows.length === 0) return <div style={{ color: 'var(--ant-color-text-secondary)', padding: 12 }}>暂无提交记录</div>;
  return (
    <div>
      {rows.map((r) => (
        <div
          key={r.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(r.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(r.id); }}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 4px', borderBottom: '1px solid var(--ant-color-border)',
            cursor: 'pointer',
          }}
        >
          <Space>
            <Tag color={SUB_STATUS_COLOR[r.status] || 'default'} style={{ borderRadius: 10 }} className="oj-status-pill">{r.status}</Tag>
            <span style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>{r.language}</span>
          </Space>
          <Space size={12} style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)' }}>
            <span>{r.timeUsed ?? '-'}ms</span>
            <span>{r.memoryUsed ? Math.round(r.memoryUsed / 1024) + 'MB' : '-'}</span>
            <span>{new Date(r.createdAt).toLocaleString()}</span>
          </Space>
        </div>
      ))}
    </div>
  );
}