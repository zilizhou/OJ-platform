# OJ Platform

类似 LeetCode / 洛谷 / ACM 的在线评判平台,完整覆盖设计文档 [在线评判平台架构设计方案.md](在线评判平台架构设计方案.md) §1–§7 的全部能力。

## 架构一览

```
浏览器
  │
  ▼
Nginx (反向代理 + SPA + WebSocket)        ← apps/web (React + Vite + AntD + Monaco)
  │
  ▼
NestJS API ×N (无状态)                    ← apps/api
  │ ├── Prisma → PostgreSQL                  (用户/题目/提交/比赛/讨论)
  │ ├── ioredis → Redis                       (排行榜缓存 + 心跳 + pub/sub)
  │ ├── BullMQ → Redis 队列                   (派发判题任务)
  │ └── Socket.IO Gateway                    (提交结果实时推 → 浏览器)
  │
  ▼
Judge Worker ×N                           ← apps/judge
  ├── BullMQ Worker (消费判题任务)
  ├── docker.sock → 沙箱容器                  (gcc / python / java / node 隔离执行)
  └── Redis pub → API 转推到 WS
```

特性矩阵:
- ✅ 用户端:题库 / 做题页 / 提交记录 / 比赛 / 讨论区 / 题解(剧透门禁)/ 个人主页 + 徽章 + 365 天活跃日历
- ✅ 管理端:题目 CRUD / 比赛 CRUD / 批量导入(FPS、通用 ZIP、洛谷三种 Adapter)/ 判题机监控
- ✅ 判题:cpp/python/java/javascript 四语言;标准比对 + Special Judge;cgroup 资源限制;沙箱命名 + reaper 兜底;输出超 64MB → OLE
- ✅ 比赛:ACM / IOI / OI 三种赛制 + 罚时 + 首杀 + Redis 缓存的实时榜
- ✅ 可观测:/api/health · /api/metrics (Prometheus) · /api/docs (Swagger) · 结构化日志 (Pino)

## 目录结构

```
.
├── apps/
│   ├── api/         NestJS REST API + WebSocket Gateway
│   ├── judge/       BullMQ Worker + Docker 沙箱
│   │   └── runtime/ 自建判题镜像(预装 /usr/bin/time)
│   └── web/         React + Vite SPA
├── deploy/k8s/      K8s manifests
├── docker-compose.yml         开发用(只起 postgres + redis)
└── docker-compose.prod.yml    生产用(全栈,8 服务)
```

## 一、本地开发

需要:Node 20+ / pnpm 9+ / Docker。

```bash
cp .env.example .env
pnpm install

docker compose up -d postgres redis      # 仅起 DB / Redis
pnpm --filter @oj/api prisma:migrate
pnpm --filter @oj/api prisma:seed         # 写 admin / A+B 示例题
pnpm --filter @oj/judge prisma:generate   # 让 judge 拿到 Prisma client

# 三个终端
pnpm dev:api          # http://localhost:3001/api
pnpm dev:judge        # 自动连 Redis 队列,docker.sock 拉沙箱
pnpm dev:web          # http://localhost:5173

# 默认账号:admin / admin123
```

## 二、生产部署(Docker Compose)

### 准备 .env.prod

```bash
cat > .env.prod << EOF
POSTGRES_USER=oj
POSTGRES_PASSWORD=$(openssl rand -hex 12)
POSTGRES_DB=oj
JWT_SECRET=$(openssl rand -hex 32)
MINIO_USER=ojadmin
MINIO_PASSWORD=$(openssl rand -hex 16)
EOF
```

### 国内服务器:配镜像加速

我们的 Dockerfile 默认前缀 `docker.m.daocloud.io/library/` (DaoCloud)。
如果走不通,改 `apps/*/Dockerfile` 和 `docker-compose.prod.yml` 里的 `image:` 字段。

### 构建预装 `/usr/bin/time` 的判题镜像

判题机依赖 GNU `/usr/bin/time` 抓 `%e` (wall) + `%M` (peak RSS)。基础镜像没有,所以自建:

```bash
cd apps/judge/runtime
docker build -t oj-cpp:13     -f cpp.Dockerfile     .
docker build -t oj-python:3.12 -f python.Dockerfile .
cd -
```

### 构建 + 起栈

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### 端到端冒烟测试

```bash
# 注册 admin (首次)
# 通过浏览器 /register 或:
docker exec oj-api-1 node -e "
const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcrypt');
const p = new PrismaClient();
(async () => {
  const h = await bcrypt.hash('admin123', 10);
  await p.user.upsert({where:{username:'admin'},update:{},create:{username:'admin',email:'admin@oj.local',passwordHash:h,role:'ADMIN'}});
  console.log('seeded');
  await p.\$disconnect();
})();
"

# 验证
curl http://localhost/api/health      # postgres + redis 检查
curl http://localhost/                # 浏览器 SPA
```

## 三、Kubernetes 部署

```bash
# 推镜像到自己仓库,然后:
kubectl apply -f deploy/k8s/
# 给执行判题的节点打标:
kubectl label node <node> oj-judge=true
```

注意 `deploy/k8s/21-judge.yaml` 用 `privileged: true` + `hostPath: /var/run/docker.sock`,
**仅在专用 nodepool 跑**,配合 NodeSelector 和 NetworkPolicy 隔离。

## 四、可观测

- `/api/health` — postgres + redis 健康检查 (K8s readinessProbe 直接用)
- `/api/metrics` — Prometheus 格式 (oj_http_*, oj_judge_*, oj_submissions_*)
- `/api/docs` — Swagger UI,持久化 Bearer Token
- 日志 — Pino JSON 输出,字段固定 `service: 'oj-api'`,容器日志直接喂 Loki/ELK

## 五、Snap Docker 已知坑(我们踩过的)

如果服务器装的是 `snap install docker`(而非 `apt install docker.io`),会撞这些坑:

| 现象 | 解释 | 解法 |
|---|---|---|
| `docker stop/kill/restart` 报 `permission denied` | Snap AppArmor 拦挂载了 `docker.sock` 的容器和它们的子容器 | `sudo systemctl restart snap.docker.dockerd` 重置,**或换 apt docker** |
| 沙箱容器 `--rm` 没生效,持续运行写 stdout 把磁盘吃光 | 上一条 → kill 失败,docker daemon 把容器 stdout 写到 `/var/snap/docker/common/var-lib-docker/containers/*/<id>-json.log`,可以涨到几百 GB | **沙箱必须加 `--log-driver=none`**(已在 [runner.ts](apps/judge/src/runner.ts) 写好) |
| 容器启动慢 ~1.5s | Snap docker overhead | 用 `/usr/bin/time -f "%e"` 取 *用户代码 wall time*,而不是 docker CLI wall;TLE 判定用前者(见 runner.ts) |
| `docker run -v /tmp/...` 挂不到 | Snap docker confinement,只允许 `/home` 下的路径 | 把工作目录放 `/home`,或 mount `/tmp:/tmp` 进 judge 容器(已在 [compose.prod.yml](docker-compose.prod.yml)) |
| compose `up -d` 偶发 `runc create failed: container with given ID already exists` | 上一次 daemon 重启后留下脏 runc state | `docker rm -f $(docker ps -aq)` 再 `compose up` |
| 重启 daemon 后 api 容器没法连 postgres(`ECONNREFUSED`),但其他容器没事 | docker bridge iptables 状态有时不同步 | `docker network disconnect oj_default oj-api-1 && docker network connect oj_default oj-api-1`(逐个 reconnect) |
| 重启 daemon 后 nginx 报 `host not found in upstream "api"` | compose 没重建 service 别名 | reconnect 时带 `--alias api`:`docker network connect --alias api oj_default oj-api-1` |

**生产建议**:换 apt docker,以上所有坑都消失。

## 六、常见故障排查

```bash
# 全栈状态
docker compose -f docker-compose.prod.yml ps

# api 日志(看 prisma / 业务报错)
docker logs oj-api-1 --tail 50

# judge 日志(看 sandbox / reaper)
docker logs oj-judge-1 --tail 50

# 队列实况
curl -H "Authorization: Bearer $T" http://localhost/api/admin/judge/status | jq

# Postgres 直连
docker exec -it oj-postgres-1 psql -U oj -d oj

# 强制重判某个提交
curl -X POST -H "Authorization: Bearer $T" http://localhost/api/admin/judge/rejudge/<id>

# 一次扔掉所有判题机沙箱(只能在 apt docker 下成功;Snap 下需重启 daemon)
docker ps --filter "name=^oj-sb-" -q | xargs -r docker rm -f
```

## 七、批量导入题目

管理端 `/admin/import` 拖拽以下任一格式:

| 格式 | 文件后缀 | 约定 |
|---|---|---|
| 通用 ZIP | `.zip` | 根目录 `problem.json` + `testdata/*.in,*.out`;或多题 `problems/<id>/...` |
| FPS XML | `.xml` | HustOJ / QDUOJ 通用导出 |
| 洛谷风格 ZIP | `.zip` | `problem.md` + `meta.json` + `testdata/` |

去重按 `(sourcePlatform, sourceId)` 唯一,冲突时可选跳过 / 覆盖。详见 [apps/api/src/import/upf.ts](apps/api/src/import/upf.ts) 的 UPF 中间格式。

## 八、扩展点

- **新判题语言**:加 entry 到 [apps/judge/src/languages.ts](apps/judge/src/languages.ts);如需精确内存,自建带 `/usr/bin/time` 的 runtime 镜像
- **新导入适配器**:在 [apps/api/src/import/adapters/](apps/api/src/import/adapters/) 加 Parser,转 UPF 即可
- **新成就徽章**:在 [apps/api/src/users/badges.ts](apps/api/src/users/badges.ts) 加判定函数
- **新比赛赛制**:在 [apps/api/src/contests/leaderboard.service.ts](apps/api/src/contests/leaderboard.service.ts) 仿照 `computeACM` / `computeIOI` 写
