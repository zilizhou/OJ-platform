import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Tag, Space, Avatar, Tooltip } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

interface Profile {
  user: { id: number; username: string; role: string; createdAt: string };
  stats: {
    acProblemCount: number;
    totalSubmissions: number;
    contestCount: number;
    acByDifficulty: { difficulty: number; count: number }[];
    languages: { language: string; count: number }[];
  };
  recentSolved: {
    problem: { id: number; title: string; difficulty: number; tags: string[] };
    solvedAt: string;
    language: string;
  }[];
  calendar: Record<string, number>;
  badges: { key: string; name: string; description: string; color: string }[];
}

function Calendar({ data }: { data: Record<string, number> }) {
  const today = new Date();
  const days: { date: string; count: number }[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: data[key] || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const color = (c: number) => {
    if (c === 0) return '#ebedf0';
    const t = c / max;
    if (t < 0.25) return '#9be9a8';
    if (t < 0.5) return '#40c463';
    if (t < 0.75) return '#30a14e';
    return '#216e39';
  };

  // 按周分列(53 列 × 7 行)
  const weeks: typeof days[] = [];
  let week: typeof days = [];
  const firstDow = new Date(days[0].date).getDay();
  for (let i = 0; i < firstDow; i++) week.push({ date: '', count: -1 });
  for (const d of days) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) weeks.push(week);

  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {weeks.map((w, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {w.map((d, j) => (
            d.count === -1
              ? <div key={j} style={{ width: 12, height: 12 }} />
              : <Tooltip key={j} title={`${d.date}: ${d.count} 次提交`}>
                  <div style={{ width: 12, height: 12, background: color(d.count), borderRadius: 2 }} />
                </Tooltip>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function UserProfile() {
  const { username } = useParams();
  const [data, setData] = useState<Profile>();

  useEffect(() => {
    api.get<Profile>(`/users/${username}`).then((r) => setData(r.data));
  }, [username]);

  if (!data) return null;

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space size="large" align="center">
          <Avatar size={72} icon={<UserOutlined />} />
          <div>
            <h2 style={{ margin: 0 }}>{data.user.username}</h2>
            <Space style={{ marginTop: 8 }}>
              <Tag>{data.user.role}</Tag>
              <span style={{ color: '#999' }}>
                加入于 {new Date(data.user.createdAt).toLocaleDateString()}
              </span>
            </Space>
            <div style={{ marginTop: 12 }}>
              <Space wrap>
                {data.badges.length === 0 && <span style={{ color: '#999' }}>暂无徽章,继续努力!</span>}
                {data.badges.map((b) => (
                  <Tooltip key={b.key} title={b.description}>
                    <Tag color={b.color} style={{ padding: '4px 8px' }}>🏅 {b.name}</Tag>
                  </Tooltip>
                ))}
              </Space>
            </div>
          </div>
        </Space>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="AC 题目" value={data.stats.acProblemCount} /></Card></Col>
        <Col span={6}><Card><Statistic title="总提交" value={data.stats.totalSubmissions} /></Card></Col>
        <Col span={6}><Card><Statistic title="参赛" value={data.stats.contestCount} /></Card></Col>
        <Col span={6}><Card><Statistic title="使用语言" value={data.stats.languages.length} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="难度分布">
            <Space size="middle">
              {data.stats.acByDifficulty.map((d) => (
                <div key={d.difficulty} style={{ textAlign: 'center' }}>
                  <div style={{ color: '#fa8c16', fontSize: 16 }}>{'★'.repeat(d.difficulty)}</div>
                  <b style={{ fontSize: 20 }}>{d.count}</b>
                </div>
              ))}
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="语言使用">
            <Space wrap>
              {data.stats.languages.map((l) => (
                <Tag key={l.language} color="blue">{l.language} × {l.count}</Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="过去一年的提交活跃度" style={{ marginBottom: 16 }}>
        <Calendar data={data.calendar} />
      </Card>

      <Card title="最近解出">
        {data.recentSolved.length === 0 && <span style={{ color: '#999' }}>暂无</span>}
        <Space wrap size="middle">
          {data.recentSolved.map((s) => (
            <Link key={s.problem.id} to={`/problems/${s.problem.id}`}>
              <Tag color="green" style={{ padding: '4px 8px' }}>
                {s.problem.title} ({s.language})
              </Tag>
            </Link>
          ))}
        </Space>
      </Card>
    </>
  );
}
