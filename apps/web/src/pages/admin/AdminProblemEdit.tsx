import { useEffect, useState } from 'react';
import {
  Form, Input, InputNumber, Button, Card, Space, message, Table, Switch, Select, Radio,
} from 'antd';
import Editor from '@monaco-editor/react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';

interface Testcase {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  score: number;
}

export default function AdminProblemEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const [form] = Form.useForm();
  const [testcases, setTestcases] = useState<Testcase[]>([]);
  const [judgeMode, setJudgeMode] = useState<'STANDARD' | 'SPECIAL'>('STANDARD');
  const [spjCode, setSpjCode] = useState<string>(
    '// SPJ 协议: argv[1]=input argv[2]=expected argv[3]=user_output\n' +
    '// 返回 0 = AC,1 = WA,其他 = 校验器异常 (RE)\n' +
    '#include <fstream>\nint main(int argc, char** argv) {\n    std::ifstream a(argv[2]), b(argv[3]);\n    std::string x, y;\n    while (a >> x && b >> y) if (x != y) return 1;\n    if ((a >> x) || (b >> y)) return 1;\n    return 0;\n}\n',
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({ difficulty: 1, timeLimit: 1000, memoryLimit: 256, tags: [] });
      return;
    }
    api.get(`/admin/problems/${id}`).then((r) => {
      form.setFieldsValue(r.data);
      setTestcases(r.data.testcases || []);
      setJudgeMode(r.data.judgeMode || 'STANDARD');
      if (r.data.spjCode) setSpjCode(r.data.spjCode);
    });
  }, [id]);

  const save = async () => {
    const values = await form.validateFields();
    const body = {
      ...values,
      testcases,
      judgeMode,
      spjLanguage: judgeMode === 'SPECIAL' ? 'cpp' : null,
      spjCode: judgeMode === 'SPECIAL' ? spjCode : null,
    };
    if (isNew) {
      const { data } = await api.post('/admin/problems', body);
      message.success('已创建');
      navigate(`/admin/problems/${data.id}`);
    } else {
      await api.put(`/admin/problems/${id}`, body);
      message.success('已保存');
    }
  };

  const addCase = () =>
    setTestcases([...testcases, { input: '', expectedOutput: '', isSample: false, score: 10 }]);

  const updateCase = (idx: number, patch: Partial<Testcase>) =>
    setTestcases(testcases.map((t, i) => (i === idx ? { ...t, ...patch } : t)));

  const removeCase = (idx: number) =>
    setTestcases(testcases.filter((_, i) => i !== idx));

  return (
    <>
      <Card title={isNew ? '新建题目' : `编辑题目 #${id}`} style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Form.Item label="标题" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="题面 (Markdown)" name="description" rules={[{ required: true }]}>
            <Input.TextArea rows={10} />
          </Form.Item>
          <Space size="large">
            <Form.Item label="难度 (1-5)" name="difficulty">
              <InputNumber min={1} max={5} />
            </Form.Item>
            <Form.Item label="时间限制 (ms)" name="timeLimit">
              <InputNumber min={100} max={30000} />
            </Form.Item>
            <Form.Item label="内存限制 (MB)" name="memoryLimit">
              <InputNumber min={16} max={1024} />
            </Form.Item>
          </Space>
          <Form.Item label="标签" name="tags">
            <Select mode="tags" />
          </Form.Item>
        </Form>
      </Card>

      <Card title="判题模式" style={{ marginBottom: 16 }}>
        <Radio.Group value={judgeMode} onChange={(e) => setJudgeMode(e.target.value)}>
          <Radio.Button value="STANDARD">标准比对</Radio.Button>
          <Radio.Button value="SPECIAL">Special Judge (C++)</Radio.Button>
        </Radio.Group>
        {judgeMode === 'SPECIAL' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, color: '#666' }}>
              校验器源码:被调用为 <code>./spj &lt;input&gt; &lt;expected&gt; &lt;user_output&gt;</code>。退出码 0=AC,1=WA。
            </div>
            <Editor
              height="40vh"
              language="cpp"
              value={spjCode}
              onChange={(v) => setSpjCode(v || '')}
              options={{ minimap: { enabled: false }, fontSize: 13 }}
            />
          </div>
        )}
      </Card>

      <Card
        title="测试点"
        extra={<Button onClick={addCase}>添加测试点</Button>}
        style={{ marginBottom: 16 }}
      >
        <Table
          rowKey={(_, i) => String(i)}
          dataSource={testcases}
          pagination={false}
          columns={[
            { title: '#', render: (_, __, i) => i + 1, width: 50 },
            {
              title: '输入',
              render: (_, r, i) => (
                <Input.TextArea
                  rows={3}
                  value={r.input}
                  onChange={(e) => updateCase(i, { input: e.target.value })}
                />
              ),
            },
            {
              title: '期望输出',
              render: (_, r, i) => (
                <Input.TextArea
                  rows={3}
                  value={r.expectedOutput}
                  onChange={(e) => updateCase(i, { expectedOutput: e.target.value })}
                />
              ),
            },
            {
              title: '样例',
              width: 80,
              render: (_, r, i) => (
                <Switch checked={r.isSample} onChange={(v) => updateCase(i, { isSample: v })} />
              ),
            },
            {
              title: '分值',
              width: 80,
              render: (_, r, i) => (
                <InputNumber value={r.score} onChange={(v) => updateCase(i, { score: v || 0 })} />
              ),
            },
            {
              title: '',
              width: 80,
              render: (_, __, i) => (
                <Button size="small" danger onClick={() => removeCase(i)}>删除</Button>
              ),
            },
          ]}
        />
      </Card>

      <Space>
        <Button type="primary" onClick={save}>保存</Button>
        <Button onClick={() => navigate('/admin/problems')}>返回</Button>
      </Space>
    </>
  );
}
