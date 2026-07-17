import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Input, Select, Spin } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth, useProblemBank } from '../store';

interface ProblemRow {
  id: number;
  title: string;
  difficulty: number;
  status: 'AC' | 'ATTEMPTED' | 'TODO';
}

interface ListResult {
  items: ProblemRow[];
  total: number;
}

const DIFF_TEXT: Record<number, { text: string; color: string }> = {
  1: { text: '简单', color: '#00af9b' },
  2: { text: '中等', color: '#ffb800' },
  3: { text: '中等', color: '#ffb800' },
  4: { text: '困难', color: '#ff375f' },
  5: { text: '困难', color: '#ff375f' },
};

export default function ProblemBankDrawer() {
  const open = useProblemBank((s) => s.open);
  const setOpen = useProblemBank((s) => s.setOpen);
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<ProblemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [difficulty, setDifficulty] = useState<number | undefined>();
  const listRef = useRef<HTMLDivElement>(null);

  const currentId = useMemo(() => {
    const m = location.pathname.match(/^\/problems\/(\d+)/);
    return m ? Number(m[1]) : undefined;
  }, [location.pathname]);

  const solvedCount = useMemo(() => items.filter((i) => i.status === 'AC').length, [items]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
    setItems([]);
  }, [open, q, difficulty]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params: Record<string, string> = { page: String(page), pageSize: '50' };
    if (q) params.q = q;
    if (difficulty) params.difficulty = String(difficulty);
    api.get<ListResult>('/problems', { params })
      .then((r) => {
        setTotal(r.data.total);
        setItems((prev) => (page === 1 ? r.data.items : [...prev, ...r.data.items]));
      })
      .finally(() => setLoading(false));
  }, [open, page, q, difficulty]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el || loading || items.length >= total) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      setPage((p) => p + 1);
    }
  };

  const goProblem = (problemId: number) => {
    const contestId = searchParams.get('contestId');
    const suffix = contestId ? `?contestId=${contestId}` : '';
    navigate(`/problems/${problemId}${suffix}`);
    setOpen(false);
  };

  return (
    <Drawer
      title={
        <span style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => { setOpen(false); navigate('/problems'); }}>
          题库 <RightOutlined style={{ fontSize: 11 }} />
        </span>
      }
      placement="left"
      width={380}
      open={open}
      onClose={() => setOpen(false)}
      destroyOnClose
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}
    >
      <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--ant-color-border)' }}>
        {token && (
          <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 8 }}>
            {solvedCount}/{total} 本页已通过 · 共 {total} 题
          </div>
        )}
        {!token && (
          <div style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', marginBottom: 8 }}>
            共 {total} 题
          </div>
        )}
        <Input.Search
          placeholder="搜索题目"
          allowClear
          size="small"
          onSearch={setQ}
          onChange={(e) => !e.target.value && setQ('')}
          style={{ marginBottom: 8 }}
        />
        <Select
          placeholder="难度"
          value={difficulty}
          onChange={setDifficulty}
          allowClear
          size="small"
          style={{ width: '100%' }}
          options={[
            { value: 1, label: '简单' },
            { value: 2, label: '中等' },
            { value: 4, label: '困难' },
          ]}
        />
      </div>

      <div
        ref={listRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {items.map((p) => {
          const diff = DIFF_TEXT[p.difficulty] ?? DIFF_TEXT[1];
          const active = p.id === currentId;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => goProblem(p.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goProblem(p.id); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 16px',
                cursor: 'pointer',
                background: active ? 'var(--ant-color-primary)' : 'transparent',
                color: active ? '#fff' : 'var(--ant-color-text)',
                borderBottom: '1px solid var(--ant-color-border-secondary)',
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.id}. {p.title}
              </span>
              <span style={{ fontSize: 12, color: active ? '#fff' : diff.color, flexShrink: 0 }}>
                {diff.text}
              </span>
            </div>
          );
        })}
        {loading && (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ant-color-text-tertiary)' }}>
            没有匹配的题目
          </div>
        )}
      </div>
    </Drawer>
  );
}
