import { useEffect, useState } from 'react';
import { Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { api, SubmissionRow } from '../api';

const STATUS_COLOR: Record<string, string> = {
  Pending: 'default',
  Judging: 'processing',
  AC: 'success',
  WA: 'error',
  TLE: 'warning',
  MLE: 'warning',
  OLE: 'warning',
  RE: 'error',
  CE: 'error',
  SE: 'magenta',
};

export default function Submissions() {
  const [data, setData] = useState<SubmissionRow[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  useEffect(() => {
    const load = () => api.get<SubmissionRow[]>('/submissions').then((r) => setData(r.data));
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Table
      rowKey="id"
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
          title: '用户',
          width: 120,
          render: (_, r) => <Link to={`/users/${r.user.username}`}>{r.user.username}</Link>,
        },
        { title: '题目', render: (_, r) => <Link to={`/problems/${r.problemId}`}>{r.problem.title}</Link> },
        { title: '语言', dataIndex: 'language', width: 100 },
        {
          title: '状态',
          dataIndex: 'status',
          width: 100,
          render: (s) => <Tag color={STATUS_COLOR[s] || 'default'}>{s}</Tag>,
        },
        { title: '耗时', dataIndex: 'timeUsed', width: 100, render: (t) => (t != null ? `${t}ms` : '-') },
        { title: '内存', dataIndex: 'memoryUsed', width: 100, render: (m) => (m ? `${Math.round(m / 1024)}MB` : '-') },
        { title: '时间', dataIndex: 'createdAt', render: (t, r) => <Link to={`/submissions/${r.id}`}>{new Date(t).toLocaleString()}</Link> },
      ]}
    />
  );
}
