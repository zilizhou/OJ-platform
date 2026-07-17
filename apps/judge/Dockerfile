FROM docker.m.daocloud.io/library/node:20-alpine AS build
WORKDIR /app
# bcrypt (api 的依赖,被 workspace 拉进来) 需要 native build tools
RUN apk add --no-cache openssl python3 make g++
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/judge/package.json apps/judge/
# 国内机：npm/bcrypt/node-gyp 全走镜像，避免 GitHub / unofficial-builds 超时
ENV npm_config_bcrypt_binary_host_mirror=https://cdn.npmmirror.com/binaries/node.bcrypt.js
ENV npm_config_disturl=https://npmmirror.com/mirrors/node
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
RUN corepack enable && pnpm config set registry https://registry.npmmirror.com \
 && pnpm install --filter @oj/judge --frozen-lockfile=false
COPY apps/judge ./apps/judge
RUN pnpm --filter @oj/judge prisma:generate \
 && pnpm --filter @oj/judge build

FROM docker.m.daocloud.io/library/node:20-alpine
# 容器里需要 docker CLI 来调度判题沙箱(挂宿主 /var/run/docker.sock)
RUN apk add --no-cache docker-cli openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/judge/node_modules ./apps/judge/node_modules
COPY --from=build /app/apps/judge/dist ./apps/judge/dist
COPY --from=build /app/apps/judge/package.json ./apps/judge/package.json
WORKDIR /app/apps/judge
CMD ["node", "dist/index.js"]
