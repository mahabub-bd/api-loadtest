# syntax=docker/dockerfile:1

# NOTE: the build context is this client/ directory (Dokploy builds with the
# Dockerfile's own folder as context), so all COPY paths are relative to it.

# ---- Build stage: install deps and build the Vite bundle ----
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm run build

# ---- Runtime stage: nginx serves the static bundle and proxies /api ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
