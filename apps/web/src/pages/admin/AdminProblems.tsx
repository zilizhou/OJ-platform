import { useEffect, useState } from 'react';
import { Table, Button, Space, Popconfirm, Tag, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';

interface AdminProblem {
  id: number;
  title: string;
  difficulty: number;
  tags: string[];
  sourcePlatform: string | null;
  sourceId: string | null;
  _count: { testcases: number; submissions: number };
}

export default function AdminProblems() {
  const [data, setData] = useState<AdminProblem[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get<AdminProblem[]>('/admin/problems')
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (id: number) => {
    await api.delete(`/admin/problems/${id}`);
    message.success('已删除');
    load();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => navigate('/admin/problems/new')}>新建题目</Button>
        <Button onClick={() => navigate('/admin/import')}>批量导入</Button>
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
            render: (t, r) => <Link to={`/admin/problems/${r.id}`}>{t}</Link>,
          },
          { title: '难度', dataIndex: 'difficulty', width: 80, render: (d) => '★'.repeat(d) },
          {
            title: '来源',
            width: 160,
            render: (_, r) => r.sourcePlatform ? <Tag>{r.sourcePlatform}#{r.sourceId}</Tag> : <Tag color="green">原创</Tag>,
          },
          { title: '测试点', width: 80, render: (_, r) => r._count.testcases },
          { title: '提交数', width: 80, render: (_, r) => r._count.submissions },
          {
            title: '操作',
            width: 160,
            render: (_, r) => (
              <Space>
                <Button size="small" onClick={() => navigate(`/admin/problems/${r.id}`)}>编辑</Button>
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
