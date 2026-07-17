import { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Tabs, Tag, Space, Button, List, Avatar, Tooltip } from 'antd';
import { FireOutlined, BookOutlined, TrophyOutlined, MessageOutlined, RightOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store';
import { LEARNING_PLANS } from '../data/learningPlans';

interface ProblemRow {
  id: number;
  title: string;
  difficulty: number;
  tags: string[];
  acceptanceRate?: number;
  acCount?: number;
  totalCount?: number;
}

interface Contest {
  id: number; title: string; ruleType: string; startTime: string; endTime: string;
  _count: { problems: number; registrations: number };
}

interface PostRow {
  id: number; title: string; kind: string; createdAt: string;
  author: { username: string }; _count: { comments: number };
}

interface DailyProblem { id: number; title: string; difficulty: number; tags: string[] }

const WEEK_LABEL = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DIFFICULTY_COLOR: Record<number, string> = {
  1: '#52c41a', 2: '#13c2c2', 3: '#1677ff', 4: '#fa8c16', 5: '#cf1322',
};
const DIFFICULTY_LABEL: Record<number, string> = {
  1: '入门', 2: '简单', 3: '中等', 4: '困难', 5: '挑战',
};

function MiniHeatmap({ calendar, weeks }: { calendar: Record<string, number>; weeks: number }) {
  const today = new Date();
  const days = weeks * 7;
  const data: { date: string; count: number; offset: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    data.push({ date: key, count: calendar[key] || 0, offset: i });
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  const color = (c: number) => {
    if (c === 0) return '#ebedf0';
    const t = c / max;
    if (t < 0.25) return '#9be9a8';
    if (t < 0.5) return '#40c463';
    if (t < 0.75) return '#30a14e';
    return '#216e39';
  };
  // 按周分列 (从最早到今天)
  const cols: typeof data[] = [];
  let col: typeof data = [];
  const firstDow = new Date(data[0].date).getDay();
  for (let i = 0; i < firstDow; i++) col.push({ date: '', count: -1, offset: -1 });
  for (const d of data) {
    col.push(d);
    if (col.length === 7) { cols.push(col); col = []; }
  }
  if (col.length) cols.push(col);

  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-start', marginTop: 12 }}>
      {cols.map((c, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {c.map((d, j) =>
            d.count === -1 ? (
              <div key={j} style={{ width: 11, height: 11 }} />
            ) : (
              <Tooltip key={j} title={`${d.date}: ${d.count} 次提交`}>
                <div style={{ width: 11, height: 11, background: color(d.count), borderRadius: 2 }} />
              </Tooltip>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function ProblemFeed({ problems }: { problems: ProblemRow[] }) {
  return (
    <List
      dataSource={problems}
      renderItem={(p) => (
        <List.Item style={{ padding: '12px 0' }}>
          <List.Item.Meta
            avatar={<BookOutlined style={{ fontSize: 18, color: '#1677ff', marginTop: 2 }} />}
            title={
              <Space>
                <Link to={`/problems/${p.id}`} style={{ fontSize: 15 }}>{p.id}. {p.title}</Link>
                <Tag color={DIFFICULTY_COLOR[p.difficulty]} style={{ marginInlineStart: 0 }}>
                  {DIFFICULTY_LABEL[p.difficulty]}
                </Tag>
              </Space>
            }
            description={
              <Space size="small" wrap>
                {p.acceptanceRate !== undefined && p.totalCount && p.totalCount > 0 && (
                  <span>通过率 {(p.acceptanceRate * 100).toFixed(1)}%</span>
                )}
                {p.tags?.slice(0, 4).map((t) => <Tag key={t}>{t}</Tag>)}
              </Space>
            }
          />
        </List.Item>
      )}
    />
  );
}

function ContestFeed({ contests }: { contests: Contest[] }) {
  return (
    <List
      dataSource={contests}
      locale={{ emptyText: '暂无比赛' }}
      renderItem={(c) => {
        const now = Date.now();
        const start = new Date(c.startTime).getTime();
        const end = new Date(c.endTime).getTime();
        const phase = now < start ? '未开始' : now < end ? '进行中' : '已结束';
        const color = phase === '进行中' ? 'processing' : phase === '未开始' ? 'default' : 'success';
        return (
          <List.Item style={{ padding: '12px 0' }}>
            <List.Item.Meta
              avatar={<TrophyOutlined style={{ fontSize: 18, color: '#fa8c16', marginTop: 2 }} />}
              title={
                <Space>
                  <Link to={`/contests/${c.id}`} style={{ fontSize: 15 }}>{c.title}</Link>
                  <Tag color={color}>{phase}</Tag>
                  <Tag color="blue">{c.ruleType}</Tag>
                </Space>
              }
              description={`${new Date(c.startTime).toLocaleString()} · ${c._count.problems} 题 · ${c._count.registrations} 人报名`}
            />
          </List.Item>
        );
      }}
    />
  );
}

function PostFeed({ posts }: { posts: PostRow[] }) {
  return (
    <List
      dataSource={posts}
      locale={{ emptyText: '暂无讨论' }}
      renderItem={(p) => (
        <List.Item style={{ padding: '12px 0' }}>
          <List.Item.Meta
            avatar={<MessageOutlined style={{ fontSize: 18, color: '#13c2c2', marginTop: 2 }} />}
            title={
              <Space>
                <Link to={`/posts/${p.id}`} style={{ fontSize: 15 }}>{p.title}</Link>
                {p.kind === 'EDITORIAL' && <Tag color="gold">题解</Tag>}
              </Space>
            }
            description={`${p.author.username} · ${new Date(p.createdAt).toLocaleString()} · ${p._count.comments} 评论`}
          />
        </List.Item>
      )}
    />
  );
}

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [algProblems, setAlgProblems] = useState<ProblemRow[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [daily, setDaily] = useState<DailyProblem | null>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    api.get('/problems', { params: { pageSize: 10 } })
      .then((r) => setProblems(r.data.items ?? r.data))
      .catch(() => {});
    api.get('/problems', { params: { pageSize: 10, tags: '算法' } })
      .then((r) => setAlgProblems(r.data.items ?? r.data))
      .catch(() => setAlgProblems([]));
    api.get('/contests').then((r) => setContests(r.data.slice(0, 8))).catch(() => {});
    api.get('/problems/daily').then((r) => setDaily(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    api.get(`/users/${user.username}`).then((r) => setProfile(r.data)).catch(() => {});
  }, [user?.username]);

  // 抓"任一题目"下最近的讨论 — 简化为遍历前几道有讨论的题
  useEffect(() => {
    (async () => {
      const seen: PostRow[] = [];
      for (const p of problems.slice(0, 5)) {
        try {
          const r = await api.get<PostRow[]>(`/posts`, { params: { problemId: p.id } });
          seen.push(...r.data.slice(0, 2));
        } catch {}
        if (seen.length >= 6) break;
      }
      setPosts(seen.slice(0, 8));
    })();
  }, [problems.length]);

  const today = new Date();
  const week = useMemo(() => {
    return [...Array(7)].map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - today.getDay() + i);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.toDateString()]);

  // 用户统计:连续提交 / 本月解决 / 每日一题(暂以 0 占位)
  const calendar: Record<string, number> = profile?.calendar ?? {};
  const streak = useMemo(() => {
    let s = 0;
    const d = new Date();
    while (true) {
      const key = d.toISOString().slice(0, 10);
      if (!calendar[key]) break;
      s++;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }, [profile?.calendar]);

  const monthSolved = useMemo(() => {
    if (!profile?.recentSolved) return 0;
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return profile.recentSolved.filter((s: any) => new Date(s.solvedAt) >= start).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.recentSolved, today.toDateString()]);

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={17}>
        {/* 学习计划 */}
        <Space style={{ marginBottom: 12 }} align="center">
          <h2 style={{ margin: 0, fontWeight: 700 }}>学习计划</h2>
          <Link to="/plans/intro-100" style={{ color: '#999' }}>
            <RightOutlined />
          </Link>
        </Space>
        <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
          {LEARNING_PLANS.map((p) => (
            <Col xs={24} sm={12} md={8} key={p.slug}>
              <Card
                hoverable
                style={{ background: p.gradient, color: '#fff', border: 0, height: 110 }}
                styles={{ body: { padding: 18 } }}
                onClick={() => navigate(`/plans/${p.slug}`)}
              >
                <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{p.title}</div>
                <div style={{ opacity: 0.9, marginTop: 8, fontSize: 13, color: '#fff' }}>{p.subtitle}</div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Tabs */}
        <Card styles={{ body: { paddingTop: 8 } }}>
          <Tabs
            defaultActiveKey="rec"
            items={[
              { key: 'rec', label: '推荐', children: <ProblemFeed problems={problems} /> },
              { key: 'alg', label: '算法', children: <ProblemFeed problems={algProblems.length ? algProblems : problems} /> },
              { key: 'contest', label: '竞赛', children: <ContestFeed contests={contests} /> },
              { key: 'discuss', label: '讨论', children: <PostFeed posts={posts} /> },
            ]}
          />
        </Card>
      </Col>

      <Col xs={24} lg={7}>
        <Card styles={{ body: { padding: 20 } }}>
          {/* 周日历 */}
          <Row>
            {week.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString();
              return (
                <Col flex="1" key={i} style={{ textAlign: 'center' }}>
                  <div style={{ color: isToday ? '#1677ff' : '#999', fontSize: 11, fontWeight: 500 }}>
                    {WEEK_LABEL[d.getDay()]}
                  </div>
                  <div style={{
                    marginTop: 6,
                    fontWeight: isToday ? 700 : 400,
                    fontSize: isToday ? 18 : 14,
                    color: isToday ? '#1677ff' : '#444',
                  }}>
                    {isToday ? '今' : d.getDate().toString().padStart(2, '0')}
                  </div>
                </Col>
              );
            })}
          </Row>

          {/* 每日一题 */}
          {daily && (
            <div style={{ marginTop: 18, padding: 14, background: '#e6f4ff', borderRadius: 10 }}>
              <Space size={4}>
                <FireOutlined style={{ color: '#1677ff' }} />
                <span style={{ color: '#1677ff', fontWeight: 600 }}>每日 1 题</span>
              </Space>
              <div style={{ marginTop: 8 }}>
                <Link to={`/problems/${daily.id}`} style={{ fontSize: 15 }}>
                  {daily.id}. {daily.title}
                </Link>
              </div>
              <Space size={6} style={{ marginTop: 6 }}>
                <Tag color={DIFFICULTY_COLOR[daily.difficulty]}>{DIFFICULTY_LABEL[daily.difficulty]}</Tag>
                {daily.tags?.slice(0, 2).map((t) => <Tag key={t}>{t}</Tag>)}
              </Space>
            </div>
          )}

          {/* 三联数据 */}
          <Row gutter={6} style={{ marginTop: 18 }}>
            <Col span={8}>
              <div style={{ color: '#999', fontSize: 12 }}>连续提交</div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{streak}<span style={{ fontSize: 12, marginLeft: 3, color: '#999' }}>天</span></div>
            </Col>
            <Col span={8}>
              <div style={{ color: '#999', fontSize: 12 }}>本月解决</div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{monthSolved}<span style={{ fontSize: 12, marginLeft: 3, color: '#999' }}>题</span></div>
            </Col>
            <Col span={8}>
              <div style={{ color: '#999', fontSize: 12 }}>AC 总数</div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{profile?.stats?.acProblemCount ?? 0}<span style={{ fontSize: 12, marginLeft: 3, color: '#999' }}>题</span></div>
            </Col>
          </Row>

          {/* 热力图 */}
          <MiniHeatmap calendar={calendar} weeks={20} />

          {/* CTA */}
          <Button
            block
            style={{ marginTop: 16, height: 36 }}
            onClick={() => navigate(user ? `/users/${user.username}` : '/login')}
          >
            {user ? '进展分析' : '登录后查看进展'}
          </Button>
        </Card>

        {/* 即将开始的比赛 */}
        {contests.length > 0 && (
          <Card title={<Space><TrophyOutlined style={{ color: '#fa8c16' }}/>即将开始</Space>} style={{ marginTop: 16 }} styles={{ body: { padding: 12 } }}>
            <List
              size="small"
              dataSource={contests.filter((c) => Date.now() < new Date(c.endTime).getTime()).slice(0, 3)}
              locale={{ emptyText: '近期无比赛' }}
              renderItem={(c) => (
                <List.Item style={{ padding: '6px 0' }}>
                  <Link to={`/contests/${c.id}`}>{c.title}</Link>
                </List.Item>
              )}
            />
          </Card>
        )}
      </Col>
    </Row>
  );
}
