import { useEffect, useState } from 'react';
import {
  Card, Upload, Button, Select, Table, Tag, Space, message, Alert, Radio, Progress,
} from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { useNavigate } from 'react-router-dom';

interface UpfProblem {
  title: string;
  description: string;
  difficulty?: number;
  timeLimit?: number;
  memoryLimit?: number;
  tags?: string[];
  sourcePlatform?: string;
  sourceId?: string;
  testcases: { input: string; expectedOutput: string; isSample?: boolean; score?: number }[];
}

interface PreviewResult {
  format: string;
  previewId: string;
  problems: UpfProblem[];
  errors: { problemTitle: string; field: string; message: string }[];
  duplicates: { title: string; sourceId?: string; existingId: number }[];
}

interface TaskState {
  status: 'processing' | 'done' | 'error';
  total: number;
  processed: number;
  created: number[];
  updated: number[];
  skipped: string[];
  error?: string;
}

const FORMATS = [
  { value: 'auto', label: '自动识别' },
  { value: 'generic-zip', label: '通用 ZIP (problem.json + testdata/)' },
  { value: 'fps', label: 'FPS XML (HustOJ/QDUOJ)' },
  { value: 'luogu', label: '洛谷风格 (problem.md + meta + testdata/)' },
  { value: 'hydro', label: 'Hydro (problem.yaml + problem_zh.md + testdata/)' },
] as const;

export default function AdminImport() {
  const [format, setFormat] = useState<'auto' | 'generic-zip' | 'fps' | 'luogu' | 'hydro'>('auto');
  const [onConflict, setOnConflict] = useState<'skip' | 'overwrite'>('skip');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [parseMsg, setParseMsg] = useState<string>('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskState | null>(null);
  const navigate = useNavigate();

  // 轮询任务进度
  useEffect(() => {
    if (!taskId) return;
    let stop = false;
    const tick = async () => {
      try {
        const { data } = await api.get<TaskState>(`/admin/import/tasks/${taskId}`);
        setTask(data);
        if (data.status === 'done') {
          message.success(`导入完成: 新建 ${data.created.length} · 覆盖 ${data.updated.length} · 跳过 ${data.skipped.length}`);
          return;
        }
        if (data.status === 'error') {
          message.error(`导入失败: ${data.error}`);
          return;
        }
        if (!stop) setTimeout(tick, 800);
      } catch (e: any) {
        message.error('查询任务失败: ' + (e?.response?.data?.message || e.message));
      }
    };
    tick();
    return () => { stop = true; };
  }, [taskId]);

  const upload = async (file: File) => {
    setPreview(null);
    setTask(null); setTaskId(null);
    setUploadPct(0);
    setParseMsg(`上传中 (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<PreviewResult>(
        `/admin/import/preview?format=${format}`,
        fd,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          onUploadProgress: (e) => {
            if (e.total) setUploadPct(Math.round((e.loaded / e.total) * 100));
          },
        },
      );
      setUploadPct(100);
      setParseMsg(`识别为 ${data.format} · 解析出 ${data.problems.length} 道题`);
      setPreview(data);
    } catch (e: any) {
      setUploadPct(null);
      setParseMsg('');
      message.error(e?.response?.data?.message || '上传/解析失败');
    }
    return false;
  };

  const confirm = async () => {
    if (!preview) return;
    setTask({ status: 'processing', total: preview.problems.length, processed: 0, created: [], updated: [], skipped: [] });
    try {
      // 只发 previewId,题目数组保留在服务器 Redis 缓存(避免 200MB body)
      const { data } = await api.post<{ taskId: string }>('/admin/import/confirm/async', {
        previewId: preview.previewId,
        onConflict,
      });
      setTaskId(data.taskId);
    } catch (e: any) {
      setTask(null);
      message.error(e?.response?.data?.message || '提交导入任务失败');
    }
  };

  const progressPct = task ? Math.round((task.processed / Math.max(1, task.total)) * 100) : 0;

  return (
    <>
      <Card title="批量导入题目" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space>
            <span>来源格式:</span>
            <Select
              value={format}
              onChange={setFormat}
              style={{ width: 380 }}
              options={[...FORMATS]}
            />
          </Space>
          <Upload.Dragger
            beforeUpload={upload}
            multiple={false}
            showUploadList={false}
            disabled={uploadPct !== null && uploadPct < 100}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p>点击或拖拽题包到此处</p>
            <p style={{ color: '#999', fontSize: 12 }}>支持 .zip / .xml,上限 2GB</p>
          </Upload.Dragger>
          {uploadPct !== null && (
            <Progress percent={uploadPct} status={uploadPct === 100 && preview ? 'success' : 'active'} />
          )}
          {parseMsg && <Alert type="info" message={parseMsg} showIcon />}
        </Space>
      </Card>

      {preview && !taskId && (
        <Card
          title={`预览 (${preview.problems.length} 题)`}
          extra={
            <Space>
              <Radio.Group value={onConflict} onChange={(e) => setOnConflict(e.target.value)}>
                <Radio.Button value="skip">重复跳过</Radio.Button>
                <Radio.Button value="overwrite">重复覆盖</Radio.Button>
              </Radio.Group>
              <Button
                type="primary"
                disabled={preview.errors.length > 0}
                onClick={confirm}
              >
                确认导入
              </Button>
            </Space>
          }
        >
          {preview.errors.length > 0 && (
            <Alert
              type="error"
              style={{ marginBottom: 16 }}
              message={`校验未通过 (${preview.errors.length} 处)`}
              description={
                <ul>
                  {preview.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>[{e.problemTitle}] {e.field}: {e.message}</li>
                  ))}
                  {preview.errors.length > 10 && <li>... 还有 {preview.errors.length - 10} 条</li>}
                </ul>
              }
            />
          )}
          {preview.duplicates.length > 0 && (
            <Alert
              type="warning"
              style={{ marginBottom: 16 }}
              message={`检测到 ${preview.duplicates.length} 道重复题目 (将按 ${onConflict === 'skip' ? '跳过' : '覆盖'} 处理)`}
            />
          )}
          <Table
            rowKey={(_, i) => String(i)}
            dataSource={preview.problems}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: '#', render: (_, __, i) => i + 1, width: 50 },
              { title: '标题', dataIndex: 'title' },
              {
                title: '来源',
                width: 200,
                render: (_, r) => r.sourcePlatform && (
                  <Tag>{r.sourcePlatform}#{r.sourceId}</Tag>
                ),
              },
              { title: '难度', dataIndex: 'difficulty', width: 70 },
              { title: '时限', dataIndex: 'timeLimit', width: 80, render: (t) => `${t || '-'}ms` },
              { title: '内存', dataIndex: 'memoryLimit', width: 80, render: (m) => `${m || '-'}MB` },
              { title: '测试点', width: 80, render: (_, r) => r.testcases?.length || 0 },
            ]}
          />
        </Card>
      )}

      {task && (
        <Card title="导入进度">
          <Progress
            percent={progressPct}
            status={task.status === 'error' ? 'exception' : task.status === 'done' ? 'success' : 'active'}
          />
          <Space size="large" style={{ marginTop: 12 }}>
            <span>已处理 <b>{task.processed}</b> / {task.total}</span>
            <span style={{ color: '#52c41a' }}>新建 {task.created.length}</span>
            <span style={{ color: '#1677ff' }}>覆盖 {task.updated.length}</span>
            <span style={{ color: '#fa8c16' }}>跳过 {task.skipped.length}</span>
          </Space>
          {task.status === 'done' && (
            <div style={{ marginTop: 16 }}>
              <Button type="primary" onClick={() => navigate('/admin/problems')}>
                查看题库
              </Button>
            </div>
          )}
          {task.skipped.length > 0 && (
            <Alert
              style={{ marginTop: 16 }}
              type="warning"
              message={`${task.skipped.length} 题被跳过`}
              description={
                <ul>
                  {task.skipped.slice(0, 10).map((s, i) => <li key={i}>{s}</li>)}
                  {task.skipped.length > 10 && <li>... 还有 {task.skipped.length - 10} 条</li>}
                </ul>
              }
            />
          )}
        </Card>
      )}
    </>
  );
}
