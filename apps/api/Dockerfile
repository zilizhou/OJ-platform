FROM docker.m.daocloud.io/library/node:20-alpine AS build
WORKDIR /app
# bcrypt 等 native 模块若预编译二进制下载失败需现编译
RUN apk add --no-cache openssl python3 make g++
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
# 国内机：npm/bcrypt/node-gyp 全走镜像，避免 GitHub / unofficial-builds 超时
ENV npm_config_bcrypt_binary_host_mirror=https://cdn.npmmirror.com/binaries/node.bcrypt.js
ENV npm_config_disturl=https://npmmirror.com/mirrors/node
ENV NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
RUN corepack enable && pnpm config set registry https://registry.npmmirror.com \
 && pnpm install --filter @oj/api --frozen-lockfile=false
COPY apps/api ./apps/api
RUN pnpm --filter @oj/api exec prisma generate \
 && pnpm --filter @oj/api build

FROM docker.m.daocloud.io/library/node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 3001
# 启动前等 DB 就绪、同步 schema(无 migrations 目录时用 db push)
CMD sh -c "npx prisma db push --skip-generate --accept-data-loss && node dist/main.js"
