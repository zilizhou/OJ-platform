import { useEffect, useMemo, useState } from 'react';
import {
  Breadcrumb, Button, Card, Col, Collapse, Progress, Row, Space, Table, Tag, Typography, Alert,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, BookOutlined, BulbOutlined,
  PlayCircleOutlined, TrophyOutlined, ReadOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { PLAN_MAP, type LearningPlanConfig, type PlanChapter } from '../data/learningPlans';
import { useAuth } from '../store';

const { Title, Paragraph, Text } = Typography;

interface ProblemRow {
  id: number;
  title: string;
  difficulty: number;
  tags: string[];
  status: 'AC' | 'ATTEMPTED' | 'TODO';
  acceptanceRate: number;
  acCount: number;
  totalCount: number;
}

interface ChapterData {
  chapter: PlanChapter;
  problems: ProblemRow[];
  loading: boolean;
}

const DIFFICULTY_COLOR: Record<number, string> = {
  1: 'green', 2: 'cyan', 3: 'blue', 4: 'orange', 5: 'red',
};
const DIFFICULTY_LABEL: Record<number, string> = {
  1: '入门', 2: '简单', 3: '中等', 4: '困难', 5: '挑战',
};
const STATUS_COLOR: Record<string, string> = {
  AC: 'success', ATTEMPTED: 'warning', TODO: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  AC: '已通过', ATTEMPTED: '尝试过', TODO: '未做',
};

async function fetchChapterProblems(ch: PlanChapter): Promise<ProblemRow[]> {
  const tags = ch.tagsList ?? (ch.tags ? [ch.tags] : []);
  if (!tags.length) return [];

  const batches = await Promise.all(
    tags.map((tag) =>
      api.get<{ items: ProblemRow[] }>('/problems', {
        params: {
          tags: tag,
          difficulty: ch.difficulty,
          page: ch.page ?? 1,
          pageSize: ch.pageSize,
        },
      }).then((r) => r.data.items).catch(() => [] as ProblemRow[]),
    ),
  );

  const seen = new Set<number>();
  const merged: ProblemRow[] = [];
  for (const batch of batches) {
    for (const p of batch) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        merged.push(p);
      }
    }
  }
  return merged.slice(0, ch.pageSize);
}

export default function LearningPlan() {
  const { slug } = useParams<{ slug: string }>();
  const plan = slug ? PLAN_MAP[slug] : undefined;
  const navigate = useNavigate();
  const { token } = useAuth();
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!plan) return;
    setLoading(true);
    setChapters(plan.chapters.map((ch) => ({ chapter: ch, problems: [], loading: true })));
    setActiveKeys([plan.chapters[0]?.key].filter(Boolean) as string[]);

    Promise.all(
      plan.chapters.map(async (ch) => {
        const problems = await fetchChapterProblems(ch);
        return { chapter: ch, problems, loading: false };
      }),
    ).then(setChapters).finally(() => setLoading(false));
  }, [plan?.slug]);

  const allProblems = useMemo(
    () => chapters.flatMap((c) => c.problems),
    [chapters],
  );

  const stats = useMemo(() => {
    const total = allProblems.length;
    const ac = allProblems.filter((p) => p.status === 'AC').length;
    const attempted = allProblems.filter((p) => p.status === 'ATTEMPTED').length;
    return { total, ac, attempted, todo: total - ac - attempted };
  }, [allProblems]);

  const nextProblem = useMemo(
    () => allProblems.find((p) => p.status !== 'AC'),
    [allProblems],
  );

  const scrollToPractice = (chapterKey: string) => {
    setActiveKeys((prev) => [...new Set([...prev, chapterKey])]);
    setTimeout(() => {
      document.getElementById(`chapter-${chapterKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  const chapterProgress = (problems: ProblemRow[]) => {
    if (!problems.length) return 0;
    return Math.round((problems.filter((p) => p.status === 'AC').length / problems.length) * 100);
  };

  if (!plan) {
    return (
      <Card>
        <Alert type="error" message="学习计划不存在" showIcon />
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/')}>返回主页</Button>
      </Card>
    );
  }

  const collapseItems = chapters.map((cd, idx) => ({
    key: cd.chapter.key,
    id: `chapter-${cd.chapter.key}`,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 16 }}>
        <Space>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: '50%', background: plan.accentColor,
            color: '#fff', fontSize: 13, fontWeight: 600,
          }}>
            {idx + 1}
          </span>
          <div>
            <div style={{ fontWeight: 600 }}>{cd.chapter.title}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{cd.chapter.description}</Text>
          </div>
        </Space>
        <Space size={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {cd.problems.length} 题
            {token && cd.problems.length > 0 && (
              <> · 已完成 {cd.problems.filter((p) => p.status === 'AC').length}</>
            )}
          </Text>
          {token && cd.problems.length > 0 && (
            <Progress
              type="circle"
              percent={chapterProgress(cd.problems)}
              size={36}
              strokeColor={plan.accentColor}
            />
          )}
        </Space>
      </div>
    ),
    children: (
      <div id={`chapter-${cd.chapter.key}`}>
      <Table
        rowKey="id"
        size="small"
        loading={cd.loading}
        dataSource={cd.problems}
        pagination={cd.problems.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
        locale={{ emptyText: '该章节暂无匹配题目，题库持续更新中' }}
        columns={[
          ...(token ? [{
            title: '状态',
            dataIndex: 'status',
            width: 88,
            render: (s: ProblemRow['status']) => (
              <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>
            ),
          }] : []),
          {
            title: '#',
            dataIndex: 'id',
            width: 64,
          },
          {
            title: '题目',
            dataIndex: 'title',
            render: (t: string, r: ProblemRow) => (
              <Link to={`/problems/${r.id}`}>{t}</Link>
            ),
          },
          {
            title: '难度',
            dataIndex: 'difficulty',
            width: 80,
            render: (d: number) => (
              <Tag color={DIFFICULTY_COLOR[d]}>{DIFFICULTY_LABEL[d]}</Tag>
            ),
          },
          {
            title: '通过率',
            dataIndex: 'acceptanceRate',
            width: 100,
            render: (rate: number, r: ProblemRow) =>
              r.totalCount > 0 ? `${(rate * 100).toFixed(1)}%` : '-',
          },
          {
            title: '标签',
            dataIndex: 'tags',
            render: (ts: string[]) => ts.slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>),
          },
        ]}
      />
      </div>
    ),
  }));

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/">主页</Link> },
          { title: '学习计划' },
          { title: plan.title },
        ]}
      />

      {/* Hero */}
      <Card
        style={{
          background: plan.gradient,
          border: 0,
          marginBottom: 24,
          color: '#fff',
        }}
        styles={{ body: { padding: '32px 36px' } }}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} lg={16}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 8, padding: 0 }}
              onClick={() => navigate('/')}
            >
              返回主页
            </Button>
            <Title level={2} style={{ color: '#fff', margin: '0 0 8px' }}>
              {plan.title}
            </Title>
            <Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 15, marginBottom: 16 }}>
              {plan.subtitle}
            </Paragraph>
            <Paragraph style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 0 }}>
              {plan.intro}
            </Paragraph>
          </Col>
          <Col xs={24} lg={8}>
            <Card
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
              styles={{ body: { padding: 20 } }}
            >
              {token ? (
                <>
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <Progress
                      type="dashboard"
                      percent={stats.total ? Math.round((stats.ac / stats.total) * 100) : 0}
                      strokeColor="#fff"
                      trailColor="rgba(255,255,255,0.3)"
                      format={(pct) => (
                        <span style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>{pct}%</span>
                      )}
                    />
                  </div>
                  <Row gutter={8} style={{ textAlign: 'center' }}>
                    <Col span={8}>
                      <div style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>{stats.ac}</div>
                      <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>已通过</div>
                    </Col>
                    <Col span={8}>
                      <div style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>{stats.attempted}</div>
                      <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>尝试过</div>
                    </Col>
                    <Col span={8}>
                      <div style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>{stats.total}</div>
                      <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>计划题数</div>
                    </Col>
                  </Row>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: '#fff' }}>
                  <BookOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                  <div>登录后追踪学习进度</div>
                  <Button
                    type="primary"
                    ghost
                    style={{ marginTop: 12, borderColor: '#fff', color: '#fff' }}
                    onClick={() => navigate('/login')}
                  >
                    立即登录
                  </Button>
                </div>
              )}
              {nextProblem && (
                <Button
                  block
                  icon={<PlayCircleOutlined />}
                  style={{
                    marginTop: 16,
                    background: '#fff',
                    color: plan.accentColor,
                    border: 0,
                    fontWeight: 600,
                  }}
                  onClick={() => navigate(`/problems/${nextProblem.id}`)}
                >
                  继续学习：{nextProblem.id}. {nextProblem.title}
                </Button>
              )}
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={17}>
          {/* 学习目标 */}
          <Card
            title={<Space><TrophyOutlined style={{ color: plan.accentColor }} />学习目标</Space>}
            style={{ marginBottom: 16 }}
            styles={{ body: { paddingTop: 12 } }}
          >
            <Row gutter={[12, 12]}>
              {plan.goals.map((g, i) => (
                <Col xs={24} sm={12} key={i}>
                  <Space align="start">
                    <CheckCircleOutlined style={{ color: plan.accentColor, marginTop: 4 }} />
                    <Text>{g}</Text>
                  </Space>
                </Col>
              ))}
            </Row>
          </Card>

          {/* 算法基础知识（理论导向计划） */}
          {plan.topics && plan.topics.length > 0 && (
            <Card
              title={<Space><ReadOutlined style={{ color: plan.accentColor }} />算法基础知识</Space>}
              style={{ marginBottom: 16 }}
            >
              <Row gutter={[16, 16]}>
                {plan.topics.map((topic, i) => (
                  <Col xs={24} md={12} key={topic.key}>
                    <Card
                      size="small"
                      style={{ height: '100%', borderLeft: `3px solid ${plan.accentColor}` }}
                      styles={{ body: { padding: 16 } }}
                    >
                      <Space align="start" style={{ marginBottom: 8 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 24, height: 24, borderRadius: '50%', background: `${plan.accentColor}18`,
                          color: plan.accentColor, fontSize: 12, fontWeight: 600, flexShrink: 0,
                        }}>
                          {i + 1}
                        </span>
                        <Title level={5} style={{ margin: 0 }}>{topic.title}</Title>
                      </Space>
                      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 10 }}>
                        {topic.summary}
                      </Paragraph>
                      <Space size={[4, 4]} wrap style={{ marginBottom: 10 }}>
                        {topic.keyPoints.map((p) => (
                          <Tag key={p} color="processing" style={{ margin: 0 }}>{p}</Tag>
                        ))}
                      </Space>
                      {topic.whenToUse && (
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                          <Text strong>适用场景：</Text>{topic.whenToUse}
                        </div>
                      )}
                      {topic.complexity && (
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                          <Text strong>复杂度：</Text>{topic.complexity}
                        </div>
                      )}
                      {topic.practiceChapterKey && (
                        <Button
                          type="link"
                          size="small"
                          icon={<ExperimentOutlined />}
                          style={{ padding: 0, color: plan.accentColor }}
                          onClick={() => scrollToPractice(topic.practiceChapterKey!)}
                        >
                          去做配套练习
                        </Button>
                      )}
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          {/* 章节列表 */}
          <Card
            title={
              <Space>
                <BookOutlined style={{ color: plan.accentColor }} />
                {plan.topics?.length ? '配套练习' : '课程章节'}
              </Space>
            }
            loading={loading}
          >
            <div id={`chapter-${chapters[0]?.chapter.key ?? 'start'}`} />
            <Collapse
              activeKey={activeKeys}
              onChange={(keys) => setActiveKeys(keys as string[])}
              items={collapseItems}
              expandIconPosition="end"
            />
          </Card>
        </Col>

        <Col xs={24} lg={7}>
          {/* 学习建议 */}
          <Card
            title={<Space><BulbOutlined style={{ color: plan.accentColor }} />学习建议</Space>}
          >
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {plan.tips.map((tip, i) => (
                <li key={i} style={{ marginBottom: 10, color: '#555', lineHeight: 1.6 }}>
                  {tip}
                </li>
              ))}
            </ul>
          </Card>

          {/* 计划概览 */}
          <Card title="计划概览" style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text type="secondary">章节数</Text>
                <Text strong>{plan.chapters.length}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text type="secondary">题目总数</Text>
                <Text strong>{stats.total || '加载中…'}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text type="secondary">预计周期</Text>
                <Text strong>
                  {plan.slug === 'intro-100' ? '4–8 周' : plan.slug === 'algo-150' ? '8–12 周' : plan.slug === 'algo-theory' ? '4–8 周' : '3–6 周'}
                </Text>
              </div>
            </Space>
            <Button
              block
              style={{ marginTop: 16 }}
              onClick={() => navigate('/problems')}
            >
              浏览全部题库
            </Button>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
