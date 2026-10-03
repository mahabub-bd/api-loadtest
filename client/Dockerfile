# syntax=docker/dockerfile:1

# ---- Build stage: install workspace deps and build the Vite bundle ----
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

# Copy manifests + lockfile first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json client/
RUN pnpm install --frozen-lockfile

COPY client/ client/
RUN pnpm --filter api-loadtest-client build

# ---- Runtime stage: nginx serves the static bundle and proxies /api ----
FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/client/dist /usr/share/nginx/html
EXPOSE 80
