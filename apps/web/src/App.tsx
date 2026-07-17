import { Layout, Menu, Button, Space, Switch } from 'antd';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useTheme, useProblemBank } from './store';
import ProblemList from './pages/ProblemList';
import ProblemDetail from './pages/ProblemDetail';
import Submissions from './pages/Submissions';
import SubmissionDetail from './pages/SubmissionDetail';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminProblems from './pages/admin/AdminProblems';
import AdminProblemEdit from './pages/admin/AdminProblemEdit';
import AdminImport from './pages/admin/AdminImport';
import AdminContests from './pages/admin/AdminContests';
import AdminContestEdit from './pages/admin/AdminContestEdit';
import AdminJudge from './pages/admin/AdminJudge';
import ContestList from './pages/ContestList';
import ContestDetail from './pages/ContestDetail';
import ContestLeaderboard from './pages/ContestLeaderboard';
import PostList from './pages/PostList';
import PostDetail from './pages/PostDetail';
import PostCompose from './pages/PostCompose';
import UserProfile from './pages/UserProfile';
import Home from './pages/Home';
import LearningPlan from './pages/LearningPlan';
import OAuthFinish from './pages/OAuthFinish';
import Logo from './components/Logo';
import ProblemBankDrawer from './components/ProblemBankDrawer';

const { Header, Content } = Layout;

export default function App() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  // 知新芸教师→SETTER、校管→ADMIN；学生→USER，不展示题库管理
  const isAdmin = user?.role === 'ADMIN';
  const canManage = user?.role === 'ADMIN' || user?.role === 'SETTER';

  const isOnProblemDetail = /^\/problems\/\d+/.test(location.pathname);
  const setProblemBankOpen = useProblemBank((s) => s.setOpen);

  const menuItems = [
    { key: '/', label: <Link to="/">主页</Link> },
    {
      key: '/problems',
      label: isOnProblemDetail ? (
        <span
          style={{ cursor: 'pointer' }}
          onClick={(e) => { e.preventDefault(); setProblemBankOpen(true); }}
        >
          题库
        </span>
      ) : (
        <Link to="/problems">题库</Link>
      ),
    },
    { key: '/contests', label: <Link to="/contests">比赛</Link> },
    { key: '/submissions', label: <Link to="/submissions">提交记录</Link> },
    ...(canManage
      ? [{
          key: '/admin',
          label: '题库管理',
          children: [
            { key: '/admin/problems', label: <Link to="/admin/problems">题目管理</Link> },
            { key: '/admin/import', label: <Link to="/admin/import">批量导入</Link> },
            { key: '/admin/contests', label: <Link to="/admin/contests">比赛管理</Link> },
            ...(isAdmin ? [
              { key: '/admin/judge', label: <Link to="/admin/judge">判题机监控</Link> },
            ] : []),
          ],
        }]
      : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Logo />
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname.startsWith('/problems') ? '/problems' : location.pathname]}
          items={menuItems}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Space>
          <Switch
            checked={theme === 'dark'}
            onChange={toggleTheme}
            checkedChildren="🌙"
            unCheckedChildren="☀️"
          />
          {user ? (
            <>
              <Link to={`/users/${user.username}`} style={{ color: '#fff' }}>{user.username}</Link>
              <Button onClick={() => { logout(); navigate('/login'); }}>登出</Button>
            </>
          ) : (
            <>
              <Button onClick={() => navigate('/login')}>登录</Button>
              <Button type="primary" onClick={() => navigate('/register')}>注册</Button>
            </>
          )}
        </Space>
      </Header>
      <Content style={{ padding: '24px 48px' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plans/:slug" element={<LearningPlan />} />
          <Route path="/plans/dp-basic" element={<Navigate to="/plans/algo-theory" replace />} />
          <Route path="/oauth/finish" element={<OAuthFinish />} />
          <Route path="/problems" element={<ProblemList />} />
          <Route path="/problems/:id" element={<ProblemDetail />} />
          <Route path="/submissions" element={<Submissions />} />
          <Route path="/submissions/:id" element={<SubmissionDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/contests" element={<ContestList />} />
          <Route path="/contests/:id" element={<ContestDetail />} />
          <Route path="/contests/:id/leaderboard" element={<ContestLeaderboard />} />
          <Route path="/problems/:id/posts" element={<PostList />} />
          <Route path="/problems/:id/posts/new" element={<PostCompose />} />
          <Route path="/posts/:id" element={<PostDetail />} />
          <Route path="/users/:username" element={<UserProfile />} />
          <Route
            path="/admin/problems"
            element={canManage ? <AdminProblems /> : <Navigate to="/" />}
          />
          <Route
            path="/admin/problems/:id"
            element={canManage ? <AdminProblemEdit /> : <Navigate to="/" />}
          />
          <Route
            path="/admin/import"
            element={canManage ? <AdminImport /> : <Navigate to="/" />}
          />
          <Route
            path="/admin/contests"
            element={canManage ? <AdminContests /> : <Navigate to="/" />}
          />
          <Route
            path="/admin/contests/:id"
            element={canManage ? <AdminContestEdit /> : <Navigate to="/" />}
          />
          <Route
            path="/admin/judge"
            element={isAdmin ? <AdminJudge /> : <Navigate to="/" />}
          />
          {/* 学生误开管理 URL 时回首页，不暴露管理页 */}
          <Route path="/admin/*" element={<Navigate to={canManage ? '/admin/problems' : '/'} />} />
        </Routes>
      </Content>
      <ProblemBankDrawer />
    </Layout>
  );
}
