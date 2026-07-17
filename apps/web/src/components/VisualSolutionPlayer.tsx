import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Progress, Space, Tag, Typography } from 'antd';
import {
  CaretRightOutlined, PauseOutlined, StepBackwardOutlined, StepForwardOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type {
  ArraySimPayload, DpTablePayload, IoFlowPayload, VisualScript, VisualStep,
} from '../types/visualScript';

const { Text, Paragraph } = Typography;

interface Props {
  script: VisualScript;
}

function IoFlowScene({ payload }: { payload: IoFlowPayload }) {
  if (payload.kind === 'read') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', minHeight: 160 }}>
        <div style={{
          width: '100%', maxWidth: 320, padding: '12px 16px', borderRadius: 8,
          background: '#f6ffed', border: '1px solid #b7eb8f', fontFamily: 'monospace',
        }}>
          <Text type="secondary" style={{ fontSize: 12 }}>stdin ▶</Text>
          <div style={{ fontSize: 18, marginTop: 4 }}>{payload.input || '…'}</div>
        </div>
        {payload.vars.length > 0 && (
          <Space size={16}>
            {payload.vars.map((v) => (
              <div key={v.name} style={{
                padding: '10px 20px', borderRadius: 8, background: '#e6f4ff',
                border: '2px solid #1677ff', textAlign: 'center',
                animation: 'ojVarPop 0.4s ease',
              }}>
                <div style={{ fontSize: 12, color: '#666' }}>{v.name}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1677ff' }}>{v.value}</div>
              </div>
            ))}
          </Space>
        )}
      </div>
    );
  }
  if (payload.kind === 'compute') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', minHeight: 160 }}>
        <div style={{
          display: 'inline-block', padding: '16px 32px', borderRadius: 12,
          background: 'linear-gradient(135deg,#fff7e6,#ffe7ba)', border: '2px solid #ffa940',
          fontSize: 20, fontFamily: 'monospace', fontWeight: 600,
        }}>
          {payload.expr}
        </div>
        <div style={{ marginTop: 16, fontSize: 28, fontWeight: 700, color: '#fa8c16' }}>
          = {payload.result}
        </div>
      </div>
    );
  }
  if (payload.kind === 'output') {
    return (
      <div style={{ textAlign: 'center', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          padding: '16px 40px', borderRadius: 8, background: '#f6ffed',
          border: '2px solid #52c41a', fontFamily: 'monospace', fontSize: 24, fontWeight: 700, color: '#389e0d',
        }}>
          stdout ◀ {payload.value}
        </div>
      </div>
    );
  }
  return (
    <div style={{ textAlign: 'center', padding: 24, color: '#666', minHeight: 160 }}>
      <Paragraph style={{ margin: 0, fontSize: 15 }}>{payload.text}</Paragraph>
    </div>
  );
}

function ArraySimScene({ payload }: { payload: ArraySimPayload }) {
  const cells = 'cells' in payload && payload.cells ? payload.cells
    : payload.kind === 'init' ? payload.cells : [];
  const highlight = payload.kind === 'highlight' ? new Set(payload.indices) : new Set<number>();

  if (payload.kind === 'note') {
    return (
      <div style={{ textAlign: 'center', padding: 24, minHeight: 160 }}>
        <Paragraph style={{ margin: 0, fontSize: 16 }}>{payload.text}</Paragraph>
      </div>
    );
  }
  if (payload.kind === 'result') {
    return (
      <div style={{ textAlign: 'center', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          padding: '16px 40px', borderRadius: 8, background: '#f6ffed',
          border: '2px solid #52c41a', fontSize: 28, fontWeight: 700, color: '#389e0d',
        }}>
          输出：{payload.value}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      {payload.kind === 'init' && payload.label && (
        <Text type="secondary">数组 {payload.label}</Text>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {cells.map((c, i) => (
          <div
            key={`${i}-${c}`}
            style={{
              width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, fontSize: 20, fontWeight: 600, fontFamily: 'monospace',
              background: highlight.has(i) ? '#fff1b8' : '#e6f4ff',
              border: `2px solid ${highlight.has(i) ? '#faad14' : '#1677ff'}`,
              transform: highlight.has(i) ? 'scale(1.08)' : 'scale(1)',
              transition: 'all 0.35s ease',
              boxShadow: highlight.has(i) ? '0 4px 12px rgba(250,173,20,0.35)' : 'none',
            }}
          >
            {c}
          </div>
        ))}
      </div>
      {payload.kind === 'swap' && (
        <Text type="secondary">交换位置 {payload.i} 与 {payload.j}</Text>
      )}
    </div>
  );
}

function SeqRow({
  label, cells, cur, highlight,
}: {
  label: string;
  cells: (string | number)[];
  cur?: number;
  highlight?: number[];
}) {
  const hl = new Set(highlight ?? (cur !== undefined ? [cur] : []));
  return (
    <div style={{ marginBottom: 10 }}>
      <Text strong style={{ marginRight: 8 }}>{label}</Text>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {cells.map((c, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>{i}</div>
            <div style={{
              minWidth: 40, padding: '8px 10px', borderRadius: 6, fontFamily: 'monospace',
              fontWeight: 600, fontSize: 16,
              background: hl.has(i) ? '#fff1b8' : '#e6f4ff',
              border: `2px solid ${hl.has(i) ? '#faad14' : '#1677ff'}`,
              transition: 'all 0.3s',
            }}>
              {c}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DpTableScene({ payload }: { payload: DpTablePayload }) {
  if (payload.kind === 'note') {
    return (
      <div style={{ textAlign: 'center', padding: 24, minHeight: 160 }}>
        <Paragraph style={{ margin: 0, fontSize: 15 }}>{payload.text}</Paragraph>
      </div>
    );
  }
  if (payload.kind === 'sequences') {
    return (
      <div style={{ minHeight: 160, padding: '8px 0' }}>
        <SeqRow label="A" cells={payload.a} cur={payload.curI} highlight={payload.highlightA} />
        <SeqRow label="B" cells={payload.b} cur={payload.curJ} highlight={payload.highlightB} />
      </div>
    );
  }
  if (payload.kind === 'f-array') {
    return (
      <div style={{ minHeight: 160, padding: '8px 0' }}>
        {payload.curI !== undefined && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            当前处理 A[{payload.curI}]
          </Text>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {payload.cells.map((v, j) => (
            <div key={j} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#999' }}>f[{j}]</div>
              <div style={{
                minWidth: 44, padding: '10px 8px', borderRadius: 6, fontWeight: 700,
                fontFamily: 'monospace', fontSize: 18,
                background: payload.highlight?.includes(j) ? '#fff1b8' : '#f9f0ff',
                border: `2px solid ${payload.highlight?.includes(j) ? '#faad14' : '#722ed1'}`,
              }}>
                {v}
              </div>
            </div>
          ))}
        </div>
        {payload.tValue !== undefined && (
          <Text style={{ display: 'block', marginTop: 12 }}>t = {payload.tValue}</Text>
        )}
      </div>
    );
  }
  if (payload.kind === 'match') {
    return (
      <div style={{ minHeight: 160, padding: '8px 0' }}>
        <Text style={{ display: 'block', marginBottom: 12 }}>
          匹配 A[{payload.i}] = B[{payload.j}] = <Text strong>{payload.value}</Text>
          {' '}→ f[{payload.j}] = t + 1 = <Text strong style={{ color: '#fa8c16' }}>{payload.fVal}</Text>
        </Text>
        {payload.tValue !== undefined && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>t = {payload.tValue}</Text>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {payload.cells.map((v, j) => (
            <div key={j} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#999' }}>f[{j}]</div>
              <div style={{
                minWidth: 44, padding: '10px 8px', borderRadius: 6, fontWeight: 700,
                fontFamily: 'monospace', fontSize: 18,
                background: j === payload.j ? '#fff1b8' : '#f9f0ff',
                border: `2px solid ${j === payload.j ? '#faad14' : '#722ed1'}`,
                animation: j === payload.j ? 'ojVarPop 0.4s ease' : undefined,
              }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ textAlign: 'center', minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{
        padding: '16px 40px', borderRadius: 8, background: '#f6ffed',
        border: '2px solid #52c41a', fontSize: 32, fontWeight: 700, color: '#389e0d',
      }}>
        答案：{payload.value}
      </div>
      {payload.subsequence && (
        <Text>
          一条最优子序列：
          {payload.subsequence.map((v, i) => (
            <span key={i}>
              {i > 0 && <span style={{ margin: '0 6px', color: '#999' }}>→</span>}
              <Tag color="processing">{v}</Tag>
            </span>
          ))}
        </Text>
      )}
    </div>
  );
}

function StepScene({ step, template }: { step: VisualStep; template: VisualScript['template'] }) {
  if (template === 'io-flow') {
    return <IoFlowScene payload={step.payload as IoFlowPayload} />;
  }
  if (template === 'dp-table') {
    return <DpTableScene payload={step.payload as DpTablePayload} />;
  }
  return <ArraySimScene payload={step.payload as ArraySimPayload} />;
}

export default function VisualSolutionPlayer({ script }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = script.steps.length;
  const current = script.steps[stepIdx];

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const go = useCallback((idx: number) => {
    setStepIdx(Math.max(0, Math.min(total - 1, idx)));
  }, [total]);

  useEffect(() => {
    clearTimer();
    if (!playing) return;
    const dur = current?.durationMs ?? 1800;
    timerRef.current = setTimeout(() => {
      if (stepIdx < total - 1) {
        setStepIdx((s) => s + 1);
      } else {
        setPlaying(false);
      }
    }, dur);
    return clearTimer;
  }, [playing, stepIdx, current, total]);

  useEffect(() => () => clearTimer(), []);

  const restart = () => {
    setPlaying(false);
    setStepIdx(0);
  };

  return (
    <div>
      <style>{`
        @keyframes ojVarPop {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <Paragraph type="secondary" style={{ marginBottom: 16 }}>{script.summary}</Paragraph>

      {(script.sampleInput || script.sampleOutput) && (
        <Space style={{ marginBottom: 16 }} wrap>
          {script.sampleInput && <Text code>输入: {script.sampleInput}</Text>}
          {script.sampleOutput && <Text code>输出: {script.sampleOutput}</Text>}
        </Space>
      )}

      <Card
        title={script.title}
        styles={{ body: { padding: '20px 24px' } }}
        style={{ marginBottom: 16 }}
      >
        <StepScene step={current} template={script.template} />
        <div style={{
          marginTop: 20, padding: '12px 16px', borderRadius: 8,
          background: 'var(--ant-color-fill-quaternary, #f5f5f5)',
          borderLeft: '4px solid #1677ff',
          minHeight: 48,
          transition: 'opacity 0.3s',
        }}>
          <Text strong>步骤 {stepIdx + 1}/{total}：</Text> {current.caption}
        </div>
      </Card>

      <Progress
        percent={Math.round(((stepIdx + 1) / total) * 100)}
        showInfo={false}
        strokeColor="#1677ff"
        style={{ marginBottom: 12 }}
      />

      <Space wrap>
        <Button icon={<StepBackwardOutlined />} onClick={() => { setPlaying(false); go(stepIdx - 1); }} disabled={stepIdx === 0}>
          上一步
        </Button>
        <Button
          type="primary"
          icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
          onClick={() => {
            if (stepIdx === total - 1 && !playing) {
              setStepIdx(0);
              setPlaying(true);
            } else {
              setPlaying((p) => !p);
            }
          }}
        >
          {playing ? '暂停' : stepIdx === total - 1 ? '重播' : '播放'}
        </Button>
        <Button icon={<StepForwardOutlined />} onClick={() => { setPlaying(false); go(stepIdx + 1); }} disabled={stepIdx === total - 1}>
          下一步
        </Button>
        <Button icon={<ReloadOutlined />} onClick={restart}>从头开始</Button>
      </Space>
    </div>
  );
}
