import { useState } from 'react';
import { Card, Form, Input, Button, Space, message, Radio } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export default function PostCompose() {
  const { id: problemId } = useParams();
  const [search] = useSearchParams();
  const [form] = Form.useForm();
  const [kind, setKind] = useState<'DISCUSSION' | 'EDITORIAL'>(
    (search.get('kind') as any) || 'DISCUSSION',
  );
  const navigate = useNavigate();

  const submit = async () => {
    const v = await form.validateFields();
    const { data } = await api.post('/posts', {
      problemId: Number(problemId),
      kind,
      title: v.title,
      body: v.body,
    });
    message.success('已发布');
    navigate(`/posts/${data.id}`);
  };

  return (
    <Card title={`发表帖子 (题目 #${problemId})`}>
      <Form form={form} layout="vertical">
        <Form.Item label="类型">
          <Radio.Group value={kind} onChange={(e) => setKind(e.target.value)}>
            <Radio.Button value="DISCUSSION">讨论</Radio.Button>
            <Radio.Button value="EDITORIAL">题解</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="标题" name="title" rules={[{ required: true, max: 200 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="正文 (Markdown)" name="body" rules={[{ required: true }]}>
          <Input.TextArea rows={16} />
        </Form.Item>
        <Space>
          <Button type="primary" onClick={submit}>发布</Button>
          <Button onClick={() => navigate(-1)}>取消</Button>
        </Space>
      </Form>
    </Card>
  );
}
