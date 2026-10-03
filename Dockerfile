# syntax=docker/dockerfile:1

# ---- Build stage: install workspace deps and compile the server ----
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

# Copy manifests + lockfile first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
RUN pnpm install --frozen-lockfile

COPY server/ server/
RUN pnpm --filter api-loadtest-server build \
    # Produce a self-contained deploy dir: package.json + prod node_modules + dist
    && pnpm --filter api-loadtest-server deploy --prod --legacy /out

# ---- Runtime stage ----
FROM node:22-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000
WORKDIR /app
# Run as non-root; server fires arbitrary outbound requests, so keep it contained
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /out ./
USER app
EXPOSE 4000
CMD ["node", "dist/main.js"]
