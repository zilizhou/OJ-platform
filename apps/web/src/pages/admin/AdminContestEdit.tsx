import { useEffect, useState } from 'react';
import {
  Form, Input, Button, Card, Space, Select, DatePicker, message, Table, InputNumber,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';

interface ProblemOption { id: number; title: string }
interface ContestProblemRow {
  problemId: number;
  alias: string;
  order: number;
  score: number;
  problemTitle?: string;
}

export default function AdminContestEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const [form] = Form.useForm();
  const [problems, setProblems] = useState<ContestProblemRow[]>([]);
  const [allProblems, setAllProblems] = useState<ProblemOption[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<ProblemOption[]>('/admin/problems').then((r) => setAllProblems(r.data));
  }, []);

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({
        ruleType: 'ACM',
        freezeMinutes: 0,
        timeRange: [dayjs(), dayjs().add(2, 'hour')],
      });
      return;
    }
    api.get(`/admin/contests/${id}`).then((r) => {
      const c = r.data;
      form.setFieldsValue({
        title: c.title,
        description: c.description,
        ruleType: c.ruleType,
        password: c.password,
        freezeMinutes: c.freezeMinutes ?? 0,
        timeRange: [dayjs(c.startTime), dayjs(c.endTime)],
      });
      setProblems(
        c.problems.map((p: any) => ({
          problemId: p.problemId,
          alias: p.alias,
          order: p.order,
          score: p.score,
          problemTitle: p.problem?.title,
        })),
      );
    });
  }, [id]);

  const save = async () => {
    const values = await form.validateFields();
    const [start, end] = values.timeRange;
    const body = {
      title: values.title,
      description: values.description || '',
      ruleType: values.ruleType,
      password: values.password || null,
      freezeMinutes: values.freezeMinutes ?? 0,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      problems: problems.map((p, i) => ({
        problemId: p.problemId,
        alias: p.alias || String.fromCharCode(65 + i),
        order: i,
        score: p.score,
      })),
    };
    if (isNew) {
      const { data } = await api.post('/admin/contests', body);
      message.success('已创建');
      navigate(`/admin/contests/${data.id}`);
    } else {
      await api.put(`/admin/contests/${id}`, body);
      message.success('已保存');
    }
  };

  const addProblem = () => {
    setProblems([
      ...problems,
      {
        problemId: 0,
        alias: String.fromCharCode(65 + problems.length),
        order: problems.length,
        score: 100,
      },
    ]);
  };

  const updateP = (idx: number, patch: Partial<ContestProblemRow>) =>
    setProblems(problems.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const removeP = (idx: number) => setProblems(problems.filter((_, i) => i !== idx));

  return (
    <>
      <Card title={isNew ? '新建比赛' : `编辑比赛 #${id}`} style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Form.Item label="标题" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="说明 (Markdown)" name="description">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Space size="large">
            <Form.Item label="赛制" name="ruleType" rules={[{ required: true }]}>
              <Select
                style={{ width: 120 }}
                options={[
                  { value: 'ACM', label: 'ACM/ICPC' },
                  { value: 'IOI', label: 'IOI' },
                  { value: 'OI', label: 'OI' },
                ]}
              />
            </Form.Item>
            <Form.Item label="时间" name="timeRange" rules={[{ required: true }]}>
              <DatePicker.RangePicker showTime />
            </Form.Item>
            <Form.Item label="密码 (可选)" name="password">
              <Input placeholder="留空表示公开" />
            </Form.Item>
            <Form.Item label="封榜(末段 N 分钟)" name="freezeMinutes" tooltip="ACM 比赛末段冻结排行榜,0=不封榜">
              <InputNumber min={0} max={120} />
            </Form.Item>
          </Space>
        </Form>
      </Card>

      <Card
        title="比赛题目"
        extra={<Button onClick={addProblem}>添加题目</Button>}
        style={{ marginBottom: 16 }}
      >
        <Table
          rowKey={(_, i) => String(i)}
          dataSource={problems}
          pagination={false}
          columns={[
            {
              title: '编号',
              width: 100,
              render: (_, r, i) => (
                <Input value={r.alias} onChange={(e) => updateP(i, { alias: e.target.value })} />
              ),
            },
            {
              title: '题目',
              render: (_, r, i) => (
                <Select
                  showSearch
                  value={r.problemId || undefined}
                  onChange={(v) => updateP(i, { problemId: v })}
                  filterOption={(input, opt: any) =>
                    String(opt?.label).toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: '100%' }}
                  placeholder="选择题目"
                  options={allProblems.map((p) => ({
                    value: p.id,
                    label: `#${p.id} ${p.title}`,
                  }))}
                />
              ),
            },
            {
              title: '分值 (IOI/OI)',
              width: 120,
              render: (_, r, i) => (
                <InputNumber
                  value={r.score}
                  onChange={(v) => updateP(i, { score: v || 0 })}
                />
              ),
            },
            {
              title: '',
              width: 80,
              render: (_, __, i) => (
                <Button size="small" danger onClick={() => removeP(i)}>删除</Button>
              ),
            },
          ]}
        />
      </Card>

      <Space>
        <Button type="primary" onClick={save}>保存</Button>
        <Button onClick={() => navigate('/admin/contests')}>返回</Button>
      </Space>
    </>
  );
}
