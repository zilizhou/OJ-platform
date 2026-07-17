import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { useTheme } from './store';
import 'antd/dist/reset.css';
import 'katex/dist/katex.min.css';

function loadHighlightTheme(dark: boolean) {
  const id = 'oj-hljs-theme';
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = dark
    ? 'https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github-dark.min.css'
    : 'https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github.min.css';
}

function Root() {
  const theme = useTheme((s) => s.theme);
  React.useEffect(() => {
    loadHighlightTheme(theme === 'dark');
    document.body.style.background = theme === 'dark' ? '#141414' : '#fff';
  }, [theme]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={theme === 'dark' ? { algorithm: antdTheme.darkAlgorithm } : undefined}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
