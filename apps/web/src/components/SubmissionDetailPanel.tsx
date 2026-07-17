import { useEffect, useState } from 'react';
import { Card, Descriptions, Tag, Table, Space, Spin } from 'antd';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { api, SubmissionFull, CaseDetail } from '../api';
import { useTheme } from '../store';

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

const FINAL_STATUSES = ['AC', 'WA', 'TLE', 'MLE', 'OLE', 'RE', 'CE', 'SE'];

interface SubmissionDetailPanelProps {
  submissionId: number;
}

export default function SubmissionDetailPanel({ submissionId }: SubmissionDetailPanelProps) {
  const [s, setS] = useState<SubmissionFull>();
  const { theme } = useTheme();
  const codeBg = theme === 'dark' ? 'var(--ant-color-fill-tertiary)' : '#f5f5f5';

  useEffect(() => {
    let socket: Socket | undefined;
    let poll: ReturnType<typeof setInterval>;
    let done = false;

    const load = () =>
      api.get<SubmissionFull>(`/submissions/${submissionId}`).then((r) => {
        setS(r.data);
        if (FINAL_STATUSES.includes(r.data.status)) {
          done = true;
          if (poll) clearInterval(poll);
          if (socket) socket.disconnect();
        }
      });

    setS(undefined);
    load();
    socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socket.on('connect', () => socket!.emit('subscribe', { submissionId }));
    socket.on('submission:update', (payload: { id: number; status: string }) => {
      if (payload.id !== submissionId) return;
      load();
    });
    poll = setInterval(() => {
      if (done) return;
      load();
    }, 3000);

    return () => {
      if (poll) clearInterval(poll);
      if (socket) {
        socket.emit('unsubscribe', { submissionId });
        socket.disconnect();
      }
    };
  }, [submissionId]);

  if (!s) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin tip="加载提交结果…" />
      </div>
    );
  }

  const cases = s.detail?.cases ?? [];
  const passed = cases.filter((c) => c.status === 'AC').length;
  const total = cases.length;

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="状态">
            <Space wrap>
              <Tag color={STATUS_COLOR[s.status]}>{s.status}</Tag>
              {s.status === 'Pending' && s.queuePosition != null && (
                <Tag color="default">
                  {s.queuePosition === 0 ? '即将评测…' : `前面约 ${s.queuePosition} 人`}
                </Tag>
              )}
              {total > 0 && (
                <Tag color={passed === total ? 'success' : 'error'}>
                  通过 {passed}/{total}
                </Tag>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="耗时">{s.timeUsed ?? '-'} ms</Descriptions.Item>
          <Descriptions.Item label="内存">
            {s.memoryUsed ? `${Math.round(s.memoryUsed / 1024)} MB` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="语言">{s.language}</Descriptions.Item>
          <Descriptions.Item label="用户">
            <Link to={`/users/${s.user.username}`}>{s.user.username}</Link>
          </Descriptions.Item>
          <Descriptions.Item label="题目">{s.problem.title}</Descriptions.Item>
          <Descriptions.Item label="时间">{new Date(s.createdAt).toLocaleString()}</Descriptions.Item>
        </Descriptions>
      </Card>

      {s.detail?.message && (
        <Card size="small" title="编译输出" style={{ marginBottom: 12 }}>
          <pre style={{ background: codeBg, padding: 12, whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
            {s.detail.message}
          </pre>
        </Card>
      )}

      {cases.length > 0 && (
        <Card size="small" title="测试点结果" style={{ marginBottom: 12 }}>
          <Table
            size="small"
            rowKey={(_, i) => String(i)}
            pagination={false}
            expandable={{
              rowExpandable: (r) => !!(r.expected || r.userOutput || r.message),
              expandedRowRender: (r) => <CaseExpand case={r} />,
            }}
            dataSource={cases}
            columns={[
              { title: '#', render: (_, __, i) => i + 1, width: 48 },
              {
                title: '结果',
                dataIndex: 'status',
                render: (st) => <Tag color={STATUS_COLOR[st]}>{st}</Tag>,
              },
              { title: '耗时', dataIndex: 'timeMs', render: (t) => `${t}ms`, width: 72 },
              {
                title: '内存',
                dataIndex: 'memoryKb',
                render: (kb) => (kb ? `${Math.round(kb / 1024)}MB` : '-'),
                width: 72,
              },
            ]}
          />
        </Card>
      )}

      <Card size="small" title="代码">
        <pre style={{ background: codeBg, padding: 12, whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
          {s.code}
        </pre>
      </Card>
    </div>
  );
}

function CaseExpand({ case: c }: { case: CaseDetail }) {
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {c.message && (
        <div>
          <div style={{ color: 'var(--ant-color-text-secondary)' }}>错误信息:</div>
          <pre style={{ background: '#fff0f0', padding: 8, margin: 0, fontSize: 12 }}>{c.message}</pre>
        </div>
      )}
      {c.userOutput !== undefined && (
        <div>
          <div style={{ color: 'var(--ant-color-text-secondary)' }}>你的输出:</div>
          <pre style={{ background: 'var(--ant-color-fill-tertiary)', padding: 8, margin: 0, fontSize: 12 }}>
            {c.userOutput}
          </pre>
        </div>
      )}
      {c.expected !== undefined && (
        <div>
          <div style={{ color: 'var(--ant-color-text-secondary)' }}>期望输出(仅样例可见):</div>
          <pre style={{ background: 'var(--ant-color-fill-tertiary)', padding: 8, margin: 0, fontSize: 12 }}>
            {c.expected}
          </pre>
        </div>
      )}
    </Space>
  );
}
