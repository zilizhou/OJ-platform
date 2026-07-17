import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../store';

/**
 * 后端 /api/auth/oauth/zxy/callback 处理完后 302 到这里,
 * URL 形如 /oauth/finish?token=<jwt>&user=<base64url(json)>&return=<encoded>
 * 我们把 token+user 写进 zustand(localStorage),再跳 returnUrl。
 */
export default function OAuthFinish() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const token = search.get('token');
    const userB64 = search.get('user');
    const returnUrl = search.get('return') || '/';
    if (!token || !userB64) {
      navigate('/login?error=oauth_missing_params', { replace: true });
      return;
    }
    try {
      const json = atob(userB64.replace(/-/g, '+').replace(/_/g, '/'));
      const user = JSON.parse(json);
      setAuth(token, user);
      navigate(returnUrl, { replace: true });
    } catch {
      navigate('/login?error=oauth_decode_failed', { replace: true });
    }
  }, [search, navigate, setAuth]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
      <Spin size="large" />
      <div style={{ marginTop: 16, color: '#999' }}>登录中…</div>
    </div>
  );
}
