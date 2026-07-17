import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Space, Tabs } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store';

interface PostRow {
  id: number;
  kind: 'DISCUSSION' | 'EDITORIAL';
  title: string;
  pinned: boolean;
  createdAt: string;
  author: { id: number; username: string };
  _count: { comments: number };
}

export default function PostList() {
  const { id: problemId } = useParams();
  const [kind, setKind] = useState<'DISCUSSION' | 'EDITORIAL'>('DISCUSSION');
  const [data, setData] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.get<PostRow[]>(`/posts?problemId=${problemId}&kind=${kind}`)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [problemId, kind]);

  return (
    <Card
      title={
        <Space>
          <Link to={`/problems/${problemId}`}>← 返回题目</Link>
        </Space>
      }
      extra={
        token && (
          <Button
            type="primary"
            onClick={() => navigate(`/problems/${problemId}/posts/new?kind=${kind}`)}
          >
            发表{kind === 'EDITORIAL' ? '题解' : '讨论'}
          </Button>
        )
      }
    >
      <Tabs
        activeKey={kind}
        onChange={(k) => setKind(k as any)}
        items={[
          { key: 'DISCUSSION', label: '讨论' },
          { key: 'EDITORIAL', label: '题解' },
        ]}
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        pagination={{ pageSize: 20 }}
        columns={[
          {
            title: '标题',
            render: (_, r) => (
              <Space>
                {r.pinned && <Tag color="red">置顶</Tag>}
                <Link to={`/posts/${r.id}`}>{r.title}</Link>
              </Space>
            ),
          },
          { title: '作者', width: 140, render: (_, r) => r.author.username },
          { title: '回复', width: 80, render: (_, r) => r._count.comments },
          {
            title: '时间',
            width: 180,
            dataIndex: 'createdAt',
            render: (t) => new Date(t).toLocaleString(),
          },
        ]}
      />
    </Card>
  );
}
