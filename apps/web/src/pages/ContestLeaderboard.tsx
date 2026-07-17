import { useEffect, useState } from 'react';
import { Card, Table, Tag, Tooltip } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

interface CellResult {
  attempts: number;
  accepted: boolean;
  acTimeSec?: number;
  penaltyMin?: number;
  score?: number;
  firstBlood?: boolean;
  frozen?: boolean;
  frozenAttempts?: number;
}

interface LeaderRow {
  rank: number;
  userId: number;
  username: string;
  totalScore: number;
  totalPenalty: number;
  cells: Record<string, CellResult>;
}

interface Leaderboard {
  contestId: number;
  ruleType: 'ACM' | 'IOI' | 'OI';
  generatedAt: string;
  rows: LeaderRow[];
  frozen: boolean;
  freezeTimeSec?: number;
}

function fmtSec(sec?: number) {
  if (sec === undefined) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}min`;
}

function CellView({ cell, ruleType }: { cell?: CellResult; ruleType: string }) {
  if (!cell) return <span style={{ color: '#ccc' }}>-</span>;
  if (cell.frozen && !cell.accepted) {
    return (
      <Tooltip title={`封榜期内有 ${cell.frozenAttempts ?? '?'} 次提交,结果暂未公开`}>
        <div style={{ background: '#1677ff', color: '#fff', padding: '2px 6px', borderRadius: 4, textAlign: 'center' }}>
          ?
          {cell.frozenAttempts ? <div style={{ fontSize: 11 }}>{cell.frozenAttempts} 次</div> : null}
        </div>
      </Tooltip>
    );
  }
  if (ruleType === 'ACM') {
    if (cell.accepted) {
      const bg = cell.firstBlood ? '#52c41a' : '#a0d911';
      return (
        <Tooltip title={`${cell.attempts} 次尝试,罚时 ${cell.penaltyMin}min`}>
          <div style={{ background: bg, color: '#fff', padding: '2px 6px', borderRadius: 4, textAlign: 'center' }}>
            +{cell.attempts > 1 ? cell.attempts - 1 : ''}
            <div style={{ fontSize: 11 }}>{fmtSec(cell.acTimeSec)}</div>
          </div>
        </Tooltip>
      );
    }
    return (
      <div style={{ background: '#ffccc7', color: '#a8071a', padding: '2px 6px', borderRadius: 4, textAlign: 'center' }}>
        -{cell.attempts}
      </div>
    );
  }
  // IOI / OI: 显示得分
  const color = cell.accepted ? '#52c41a' : (cell.score && cell.score > 0 ? '#fa8c16' : '#bfbfbf');
  return (
    <Tooltip title={`${cell.attempts} 次提交`}>
      <div style={{ background: color, color: '#fff', padding: '2px 6px', borderRadius: 4, textAlign: 'center' }}>
        {cell.score ?? 0}
      </div>
    </Tooltip>
  );
}

export default function ContestLeaderboard() {
  const { id } = useParams();
  const [board, setBoard] = useState<Leaderboard>();

  useEffect(() => {
    const load = () => api.get<Leaderboard>(`/contests/${id}/leaderboard`).then((r) => setBoard(r.data));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id]);

  if (!board) return null;

  const aliases = Array.from(
    new Set(board.rows.flatMap((r) => Object.keys(r.cells))),
  ).sort();

  return (
    <Card
      title={
        <>排行榜 ({board.ruleType}){board.frozen && <Tag color="blue" style={{ marginLeft: 8 }}>已封榜</Tag>}</>
      }
      extra={<span style={{ color: '#999' }}>更新于 {new Date(board.generatedAt).toLocaleTimeString()} · 5s 刷新</span>}
    >
      <Table
        rowKey="userId"
        dataSource={board.rows}
        pagination={false}
        size="small"
        columns={[
          { title: '#', dataIndex: 'rank', width: 60 },
          {
            title: '选手',
            dataIndex: 'username',
            width: 160,
            render: (u) => <Link to={`/users/${u}`}>{u}</Link>,
          },
          {
            title: board.ruleType === 'ACM' ? '解题' : '总分',
            dataIndex: 'totalScore',
            width: 80,
            render: (v) => <b>{v}</b>,
          },
          ...(board.ruleType === 'ACM'
            ? [{
                title: '罚时',
                dataIndex: 'totalPenalty',
                width: 100,
                render: (v: number) => `${Math.floor(v / 60)}min`,
              }]
            : []),
          ...aliases.map((alias) => ({
            title: alias,
            width: 80,
            align: 'center' as const,
            render: (_: any, r: LeaderRow) => (
              <CellView cell={r.cells[alias]} ruleType={board.ruleType} />
            ),
          })),
        ]}
      />
    </Card>
  );
}
