import { useEffect, useState } from 'react';
import { Card, Tag, Space, Button, Input, Popconfirm, message, Alert, Divider } from 'antd';
import Markdown from '../components/Markdown';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store';

interface CommentRow {
  id: number;
  body: string;
  createdAt: string;
  authorId: number;
  author: { id: number; username: string };
}

interface PostFull {
  id: number;
  kind: 'DISCUSSION' | 'EDITORIAL';
  title: string;
  body: string;
  pinned: boolean;
  authorId: number;
  problemId: number | null;
  contestId: number | null;
  createdAt: string;
  author: { id: number; username: string };
  comments: CommentRow[];
  spoilerGuarded: boolean;
}

export default function PostDetail() {
  const { id } = useParams();
  const [post, setPost] = useState<PostFull>();
  const [reply, setReply] = useState('');
  const [revealed, setRevealed] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const load = () => api.get<PostFull>(`/posts/${id}`).then((r) => setPost(r.data));
  useEffect(() => { load(); }, [id]);

  if (!post) return null;

  const canEdit = user && (user.id === post.authorId || user.role === 'ADMIN');
  const isAdmin = user?.role === 'ADMIN';

  const submitReply = async () => {
    if (!reply.trim()) return;
    await api.post(`/posts/${id}/comments`, { body: reply });
    setReply('');
    load();
  };

  const delPost = async () => {
    await api.delete(`/posts/${id}`);
    message.success('已删除');
    if (post.problemId) navigate(`/problems/${post.problemId}/posts`);
    else navigate(-1);
  };

  const delComment = async (cid: number) => {
    await api.delete(`/comments/${cid}`);
    load();
  };

  const togglePin = async () => {
    await api.patch(`/posts/${id}/pin`, { pinned: !post.pinned });
    load();
  };

  return (
    <>
      <Card
        title={
          <Space>
            <Tag color={post.kind === 'EDITORIAL' ? 'gold' : 'blue'}>
              {post.kind === 'EDITORIAL' ? '题解' : '讨论'}
            </Tag>
            {post.pinned && <Tag color="red">置顶</Tag>}
            {post.title}
          </Space>
        }
        extra={
          <Space>
            {post.problemId && (
              <Link to={`/problems/${post.problemId}/posts`}>← 返回讨论区</Link>
            )}
            {isAdmin && (
              <Button size="small" onClick={togglePin}>
                {post.pinned ? '取消置顶' : '置顶'}
              </Button>
            )}
            {canEdit && (
              <Popconfirm title="删除此帖?" onConfirm={delPost}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            )}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <div style={{ color: '#999', marginBottom: 16 }}>
          {post.author.username} · {new Date(post.createdAt).toLocaleString()}
        </div>
        {post.spoilerGuarded && !revealed ? (
          <Alert
            type="warning"
            showIcon
            message="题解剧透警告"
            description={
              <Space direction="vertical">
                <span>该题解仅在你 AC 该题后可见,以防剧透。如已确认查看,可点击下方按钮。</span>
                <Space>
                  <Button onClick={() => setRevealed(true)}>我已知晓,强制查看</Button>
                  {post.problemId && (
                    <Button type="primary" onClick={() => navigate(`/problems/${post.problemId}`)}>
                      去做题
                    </Button>
                  )}
                </Space>
              </Space>
            }
          />
        ) : (
          <Markdown>{post.body || '_(无内容)_'}</Markdown>
        )}
      </Card>

      <Card title={`评论 (${post.comments.length})`}>
        {post.comments.map((c) => (
          <div key={c.id} style={{ marginBottom: 16 }}>
            <Space style={{ color: '#999', fontSize: 12 }}>
              <b>{c.author.username}</b>
              <span>{new Date(c.createdAt).toLocaleString()}</span>
              {user && (c.authorId === user.id || user.role === 'ADMIN') && (
                <Popconfirm title="删除评论?" onConfirm={() => delComment(c.id)}>
                  <a>删除</a>
                </Popconfirm>
              )}
            </Space>
            <div style={{ marginTop: 4 }}><Markdown>{c.body}</Markdown></div>
            <Divider style={{ margin: '8px 0' }} />
          </div>
        ))}

        {user ? (
          <>
            <Input.TextArea
              rows={4}
              placeholder="说点什么 (支持 Markdown)…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <Button type="primary" style={{ marginTop: 8 }} onClick={submitReply}>
              回复
            </Button>
          </>
        ) : (
          <div style={{ color: '#999' }}>
            <Link to="/login">登录</Link> 后参与讨论
          </div>
        )}
      </Card>
    </>
  );
}
