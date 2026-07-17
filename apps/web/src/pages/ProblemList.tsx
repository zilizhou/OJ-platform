import { useEffect, useMemo, useState } from 'react';
import { Table, Tag, Space, Input, Select, Card } from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store';

interface Row {
  id: number;
  title: string;
  difficulty: number;
  tags: string[];
  timeLimit: number;
  memoryLimit: number;
  status: 'AC' | 'ATTEMPTED' | 'TODO';
  acceptanceRate: number; // 0-1
  acCount: number;
  totalCount: number;
}

interface ListResult {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_COLOR: Record<string, string> = {
  AC: 'success', ATTEMPTED: 'warning', TODO: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  AC: '已通过', ATTEMPTED: '尝试过', TODO: '未做',
};

export default function ProblemList() {
  const [data, setData] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState('');
  const [difficulty, setDifficulty] = useState<number | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<'AC' | 'ATTEMPTED' | 'TODO' | undefined>();
  const [allTags, setAllTags] = useState<string[]>([]);
  const { token } = useAuth();

  useEffect(() => {
    api.get<string[]>('/problems/tags').then((r) => setAllTags(r.data)).catch(() => {});
  }, []);

  // 筛选条件变化 → 回到第一页
  useEffect(() => {
    setPage(1);
  }, [q, difficulty, tags, status]);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
    if (q) params.q = q;
    if (difficulty) params.difficulty = String(difficulty);
    if (tags.length) params.tags = tags.join(',');
    if (status) params.status = status;
    api
      .get<ListResult>('/problems', { params })
      .then((r) => {
        setData(r.data.items);
        setTotal(r.data.total);
      })
      .finally(() => setLoading(false));
  }, [q, difficulty, tags, status, page, pageSize]);

  const acTotal = useMemo(() => data.filter((d) => d.status === 'AC').length, [data]);

  return (
    <>
      <Card style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索题目"
            allowClear
            style={{ width: 220 }}
            onSearch={setQ}
            onChange={(e) => !e.target.value && setQ('')}
          />
          <Select
            placeholder="难度"
            value={difficulty}
            onChange={(v) => setDifficulty(v)}
            allowClear
            style={{ width: 120 }}
            options={[1,2,3,4,5].map((n) => ({ value: n, label: '★'.repeat(n) }))}
          />
          <Select
            placeholder="标签"
            value={tags}
            onChange={setTags}
            mode="multiple"
            allowClear
            style={{ minWidth: 220 }}
            options={allTags.map((t) => ({ value: t, label: t }))}
          />
          {token && (
            <Select
              placeholder="状态"
              value={status}
              onChange={setStatus}
              allowClear
              style={{ width: 120 }}
              options={[
                { value: 'AC', label: '已通过' },
                { value: 'ATTEMPTED', label: '尝试过' },
                { value: 'TODO', label: '未做' },
              ]}
            />
          )}
          <span style={{ color: '#999' }}>
            共 {total} 题{token ? ` · 本页已通过 ${acTotal}` : ''}
          </span>
        </Space>
      </Card>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        onChange={(pag) => {
          setPage(pag.current || 1);
          setPageSize(pag.pageSize || 20);
        }}
        columns={[
          ...(token ? [{
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (s: Row['status']) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
          }] : []),
          { title: '#', dataIndex: 'id', width: 70 },
          {
            title: '题目',
            dataIndex: 'title',
            render: (t, r) => <Link to={`/problems/${r.id}`}>{t}</Link>,
          },
          {
            title: '难度',
            dataIndex: 'difficulty',
            width: 100,
            render: (d) => '★'.repeat(d) + '☆'.repeat(5 - d),
          },
          {
            title: '通过率',
            dataIndex: 'acceptanceRate',
            width: 110,
            render: (rate: number, r: Row) =>
              r.totalCount > 0
                ? `${(rate * 100).toFixed(1)}% (${r.acCount}/${r.totalCount})`
                : '-',
          },
          {
            title: '标签',
            dataIndex: 'tags',
            render: (ts: string[]) => ts.map((t) => <Tag key={t}>{t}</Tag>),
          },
        ]}
      />
    </>
  );
}