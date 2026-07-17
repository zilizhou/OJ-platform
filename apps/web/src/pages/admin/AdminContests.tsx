import { useEffect, useState } from 'react';
import { Table, Button, Space, Popconfirm, Tag, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';

interface AdminContest {
  id: number;
  title: string;
  ruleType: string;
  startTime: string;
  endTime: string;
  _count: { problems: number; registrations: number };
}

export default function AdminContests() {
  const [data, setData] = useState<AdminContest[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get<AdminContest[]>('/admin/contests')
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (id: number) => {
    await api.delete(`/admin/contests/${id}`);
    message.success('已删除');
    load();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => navigate('/admin/contests/new')}>新建比赛</Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        pagination={{ pageSize: 20 }}
        columns={[
          { title: '#', dataIndex: 'id', width: 80 },
          {
            title: '标题',
            dataIndex: 'title',
            render: (t, r) => <Link to={`/admin/contests/${r.id}`}>{t}</Link>,
          },
          { title: '赛制', dataIndex: 'ruleType', width: 100, render: (r) => <Tag color="blue">{r}</Tag> },
          { title: '开始', dataIndex: 'startTime', render: (t) => new Date(t).toLocaleString() },
          { title: '结束', dataIndex: 'endTime', render: (t) => new Date(t).toLocaleString() },
          { title: '题数', width: 80, render: (_, r) => r._count.problems },
          { title: '报名', width: 80, render: (_, r) => r._count.registrations },
          {
            title: '操作',
            width: 260,
            render: (_, r) => (
              <Space>
                <Button size="small" onClick={() => navigate(`/admin/contests/${r.id}`)}>编辑</Button>
                <Button size="small" onClick={() => navigate(`/contests/${r.id}/leaderboard`)}>榜</Button>
                <Popconfirm title="解冻后封榜期提交立刻公开" onConfirm={async () => { await api.post(`/admin/contests/${r.id}/unfreeze`); message.success("已解冻"); }}>
                  <Button size="small">解冻</Button>
                </Popconfirm>
                <Popconfirm title="确认删除?" onConfirm={() => remove(r.id)}>
                  <Button size="small" danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </>
  );
}
