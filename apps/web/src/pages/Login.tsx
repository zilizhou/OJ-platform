import { useEffect } from 'react';
import { Form, Input, Button, Card, message, Divider } from 'antd';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const [search] = useSearchParams();

  useEffect(() => {
    const err = search.get('error');
    if (err) message.error(`知新芸登录失败: ${err}`);
  }, [search]);

  const onFinish = async (v: { username: string; password: string }) => {
    try {
      const { data } = await api.post('/auth/login', v);
      setAuth(data.token, data.user);
      message.success('登录成功');
      navigate('/');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '登录失败');
    }
  };

  const loginWithZxy = () => {
    // 把当前页之外的返回 URL 传给后端,login 完后跳回去
    const ret = search.get('return') || '/';
    window.location.href = `/api/auth/sso/zxy/entry?return=${encodeURIComponent(ret)}`;
  };

  return (
    <Card title="登录" style={{ maxWidth: 400, margin: '60px auto' }}>
      <Button
        type="primary" size="large" block
        onClick={loginWithZxy}
        style={{ background: '#1677ff' }}
      >
        用知新芸账号登录
      </Button>
      <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: '#999' }}>
        知新芸学生 / 教师 / 管理员均可直接登录
      </div>

      <Divider plain style={{ fontSize: 12, color: '#999' }}>本地账号</Divider>

      <Form layout="vertical" onFinish={onFinish}>
        <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="密码" name="password" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
        <Button htmlType="submit" block>登录</Button>
      </Form>
      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12 }}>
        还没账号? <Link to="/register">注册</Link>
      </div>
    </Card>
  );
}
