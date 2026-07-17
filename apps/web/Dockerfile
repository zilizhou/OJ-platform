FROM docker.m.daocloud.io/library/node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN corepack enable && pnpm config set registry https://registry.npmmirror.com \
 && pnpm install --filter @oj/web --frozen-lockfile=false
COPY apps/web ./apps/web
RUN pnpm --filter @oj/web build

FROM docker.m.daocloud.io/library/nginx:1.25-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx-site.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
