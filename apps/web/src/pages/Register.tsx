import { Form, Input, Button, Card, message } from 'antd';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store';

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);

  const onFinish = async (v: { username: string; email: string; password: string }) => {
    try {
      const { data } = await api.post('/auth/register', v);
      setAuth(data.token, data.user);
      message.success('注册成功');
      navigate('/problems');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '注册失败');
    }
  };

  return (
    <Card title="注册" style={{ maxWidth: 400, margin: '60px auto' }}>
      <Form layout="vertical" onFinish={onFinish}>
        <Form.Item label="用户名" name="username" rules={[{ required: true, min: 3 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="密码" name="password" rules={[{ required: true, min: 6 }]}>
          <Input.Password />
        </Form.Item>
        <Button type="primary" htmlType="submit" block>注册</Button>
      </Form>
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        已有账号? <Link to="/login">登录</Link>
      </div>
    </Card>
  );
}
