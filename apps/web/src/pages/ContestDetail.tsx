import { useEffect, useState } from 'react';
import { Card, Button, Table, Tag, Space, message, Statistic, Input, Modal } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Markdown from '../components/Markdown';
import { api } from '../api';
import { useAuth } from '../store';

interface ContestProblem {
  alias: string;
  score: number;
  problem: { id: number; title: string; difficulty: number } | null;
}

interface Contest {
  id: number;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  ruleType: string;
  password: string | null;
  registered: boolean;
  hideProblems: boolean;
  problems: ContestProblem[];
  _count: { registrations: number };
}

function useCountdown(target: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (diff < 0) return null;
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

export default function ContestDetail() {
  const { id } = useParams();
  const [contest, setContest] = useState<Contest>();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const { token } = useAuth();
  const navigate = useNavigate();

  const load = () => api.get<Contest>(`/contests/${id}`).then((r) => setContest(r.data));
  useEffect(() => { load(); }, [id]);

  const now = Date.now();
  const start = contest ? new Date(contest.startTime).getTime() : 0;
  const end = contest ? new Date(contest.endTime).getTime() : 0;
  const phase = !contest ? 'loading' : now < start ? 'before' : now < end ? 'running' : 'ended';
  const countdownTo = phase === 'before' ? contest?.startTime : phase === 'running' ? contest?.endTime : undefined;
  const countdown = useCountdown(countdownTo);

  const register = async () => {
    if (!token) {
      message.warning('请先登录');
      navigate('/login');
      return;
    }
    if (contest?.password) {
      setPwdOpen(true);
      return;
    }
    await api.post(`/contests/${id}/register`, {});
    message.success('报名成功');
    load();
  };

  const submitPwd = async () => {
    try {
      await api.post(`/contests/${id}/register`, { password: pwd });
      message.success('报名成功');
      setPwdOpen(false);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '报名失败');
    }
  };

  if (!contest) return null;

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space size="large" align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>{contest.title}</h2>
            <Space style={{ marginTop: 8 }}>
              <Tag color="blue">{contest.ruleType}</Tag>
              <Tag>报名 {contest._count.registrations}</Tag>
              <span>开始: {new Date(contest.startTime).toLocaleString()}</span>
              <span>结束: {new Date(contest.endTime).toLocaleString()}</span>
            </Space>
          </div>
          <Space direction="vertical" align="end">
            {countdown && (
              <Statistic
                title={phase === 'before' ? '距开始' : '距结束'}
                value={countdown}
                valueStyle={{ color: phase === 'before' ? '#fa8c16' : '#cf1322' }}
              />
            )}
            {!contest.registered && phase !== 'ended' ? (
              <Button type="primary" size="large" onClick={register}>报名参赛</Button>
            ) : contest.registered ? (
              <Tag color="green" style={{ padding: '4px 12px' }}>已报名</Tag>
            ) : null}
            <Link to={`/contests/${id}/leaderboard`}>查看排行榜 →</Link>
          </Space>
        </Space>
        {contest.description && (
          <div style={{ marginTop: 16 }}><Markdown>{contest.description}</Markdown></div>
        )}
      </Card>

      <Card title="题目列表">
        <Table
          rowKey="alias"
          dataSource={contest.problems}
          pagination={false}
          columns={[
            { title: '编号', dataIndex: 'alias', width: 80 },
            {
              title: '题目',
              render: (_, r) => contest.hideProblems
                ? <span style={{ color: '#999' }}>开赛后揭晓</span>
                : r.problem
                  ? <Link to={`/problems/${r.problem.id}?contestId=${id}`}>{r.problem.title}</Link>
                  : '-',
            },
            { title: '难度', width: 100, render: (_, r) => r.problem ? '★'.repeat(r.problem.difficulty) : '-' },
            { title: '分值', dataIndex: 'score', width: 80 },
          ]}
        />
      </Card>

      <Modal
        open={pwdOpen}
        title="比赛密码"
        onCancel={() => setPwdOpen(false)}
        onOk={submitPwd}
      >
        <Input.Password value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="请输入比赛密码" />
      </Modal>
    </>
  );
}
