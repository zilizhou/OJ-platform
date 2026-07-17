import { useEffect, useState } from 'react';
import { Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../api';

interface Contest {
  id: number;
  title: string;
  startTime: string;
  endTime: string;
  ruleType: string;
  _count: { problems: number; registrations: number };
}

function statusOf(c: Contest): { text: string; color: string } {
  const now = Date.now();
  const start = new Date(c.startTime).getTime();
  const end = new Date(c.endTime).getTime();
  if (now < start) return { text: '未开始', color: 'default' };
  if (now < end) return { text: '进行中', color: 'processing' };
  return { text: '已结束', color: 'success' };
}

export default function ContestList() {
  const [data, setData] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  useEffect(() => {
    setLoading(true);
    api.get<Contest[]>('/contests')
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={data}
      pagination={{
        ...pagination,
        onChange: (current, pageSize) => setPagination({ current, pageSize }),
      }}
      columns={[
        {
          title: '#',
          width: 80,
          render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
        },
        {
          title: '标题',
          dataIndex: 'title',
          render: (t, r) => <Link to={`/contests/${r.id}`}>{t}</Link>,
        },
        { title: '赛制', dataIndex: 'ruleType', width: 100, render: (r) => <Tag color="blue">{r}</Tag> },
        {
          title: '开始时间',
          dataIndex: 'startTime',
          render: (t) => new Date(t).toLocaleString(),
        },
        {
          title: '结束时间',
          dataIndex: 'endTime',
          render: (t) => new Date(t).toLocaleString(),
        },
        { title: '题数', width: 80, render: (_, r) => r._count.problems },
        { title: '报名', width: 80, render: (_, r) => r._count.registrations },
        {
          title: '状态',
          width: 100,
          render: (_, r) => {
            const s = statusOf(r);
            return <Tag color={s.color}>{s.text}</Tag>;
          },
        },
      ]}
    />
  );
}
