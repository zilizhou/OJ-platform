import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Button, message, Space } from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface Status {
  counts: { waiting: number; active: number; completed: number; failed: number; delayed: number };
  workers: {
    workerId: string; hostname: string; pid: number; currentJobId: string | null;
    updatedAt: number; alive: boolean;
  }[];
  recent: {
    id: number; status: string; language: string; timeUsed: number | null; memoryUsed: number | null;
    createdAt: string; problem: { title: string }; user: { username: string };
  }[];
}

export default function AdminJudge() {
  const [data, setData] = useState<Status>();

  useEffect(() => {
    const load = () => api.get<Status>('/admin/judge/status').then((r) => setData(r.data));
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const rejudge = async (id: number) => {
    await api.post(`/admin/judge/rejudge/${id}`);
    message.success(`已重判 #${id}`);
  };

  if (!data) return null;

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={5}><Card><Statistic title="排队中" value={data.counts.waiting} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={5}><Card><Statistic title="判题中" value={data.counts.active} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={5}><Card><Statistic title="完成" value={data.counts.completed} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={5}><Card><Statistic title="失败" value={data.counts.failed} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={4}><Card><Statistic title="延迟" value={data.counts.delayed} /></Card></Col>
      </Row>

      <Card title={`判题机节点 (${data.workers.length})`} style={{ marginBottom: 16 }}>
        <Table
          rowKey="workerId"
          dataSource={data.workers}
          pagination={false}
          columns={[
            {
              title: '状态',
              width: 80,
              render: (_, r) => <Tag color={r.alive ? 'success' : 'default'}>{r.alive ? '在线' : '离线'}</Tag>,
            },
            { title: '节点 ID', dataIndex: 'workerId' },
            { title: '主机', dataIndex: 'hostname', width: 200 },
            { title: 'PID', dataIndex: 'pid', width: 100 },
            {
              title: '当前任务',
              dataIndex: 'currentJobId',
              width: 150,
              render: (j) => j ? <Tag color="processing">job #{j}</Tag> : <span style={{ color: '#ccc' }}>空闲</span>,
            },
            {
              title: '最后心跳',
              width: 180,
              render: (_, r) => `${Math.round((Date.now() - r.updatedAt) / 1000)}s 前`,
            },
          ]}
        />
      </Card>

      <Card title="最近提交">
        <Table
          rowKey="id"
          dataSource={data.recent}
          pagination={false}
          size="small"
          columns={[
            { title: '#', dataIndex: 'id', width: 80, render: (id) => <Link to={`/submissions/${id}`}>{id}</Link> },
            { title: '用户', render: (_, r) => r.user.username, width: 120 },
            { title: '题目', render: (_, r) => r.problem.title },
            { title: '语言', dataIndex: 'language', width: 100 },
            { title: '状态', dataIndex: 'status', width: 100, render: (s) => <Tag>{s}</Tag> },
            { title: '耗时', dataIndex: 'timeUsed', width: 80, render: (t) => t != null ? `${t}ms` : '-' },
            { title: '时间', width: 180, render: (_, r) => new Date(r.createdAt).toLocaleString() },
            {
              title: '',
              width: 80,
              render: (_, r) => <Button size="small" onClick={() => rejudge(r.id)}>重判</Button>,
            },
          ]}
        />
      </Card>
    </>
  );
}
