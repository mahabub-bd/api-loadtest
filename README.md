# API Load Tester

A local load-testing tool for HTTP APIs: a React UI for configuring and watching
concurrency benchmarks, backed by a NestJS (TypeScript) benchmark server that
fires requests from the server side — so CORS, browser connection limits, and
proxy behavior never distort the measurements.

## Project structure

pnpm workspace monorepo — one lockfile at the root, packages in `client/` and
`server/`.

```
client/   React + Vite + Tailwind UI
  Dockerfile         multi-stage build → nginx serving the bundle
  nginx.conf         static serving + /api reverse proxy to the server
server/   NestJS backend
  Dockerfile         multi-stage build → slim node:22-alpine runtime
  src/main.ts                     bootstrap (CORS, 1MB JSON body, localhost bind)
  src/app.module.ts
  src/error-shape.filter.ts       errors as { error: message } for the client
  src/benchmark/benchmark.service.ts    undici benchmark engine + run lock
  src/benchmark/benchmark.controller.ts /api/load-test, /stream, /api/sample
  src/benchmark/parse-config.ts   request validation
docker-compose.yml   runs both containers; UI on :8080
```

## Quickstart

Requires [pnpm](https://pnpm.io) (`corepack enable`).

```bash
pnpm install          # installs all workspace dependencies
pnpm dev              # benchmark server on :4000, Vite UI on :5173
```

Per-package scripts:

```bash
pnpm dev:server       # server only
pnpm dev:client       # client only
pnpm build            # build all packages
```

### Docker

```bash
docker compose up --build    # or: pnpm docker:up
```

Serves the UI at **http://localhost:8080** (nginx) with `/api` proxied to the
server container. The benchmark server is **not** published to the host by
default — it's only reachable inside the compose network. To call it directly
from the host, uncomment a `ports` mapping for the `server` service in
`docker-compose.yml`.

Open http://localhost:5173. The default target is the server's built-in
`/api/sample` endpoint, so you can hit **Run benchmark** immediately.

## How it works

- The UI posts a config to the benchmark server's SSE endpoint and renders
  live progress plus per-level results as they arrive.
- Each concurrency level runs sequentially, one undici Agent per level with
  `connections: concurrency` (one kept-alive socket per in-flight request).
- A short unmeasured **warmup wave** (up to 5 requests) per level pays TCP/TLS
  setup and DNS before the clock starts, so percentiles reflect steady-state.
- Failures are classified into `timeout / dns / connect / aborted / other`,
  and non-2xx/3xx responses are counted per status code — hover the red
  **Failed** cell for the breakdown.

## Metrics

All latency figures are per-request round-trip (dispatch → fully-consumed
response) in milliseconds.

| Metric | Meaning |
|---|---|
| Req/s | completed requests ÷ elapsed wall time for the level |
| Avg / P50 | mean and median latency |
| P95 / P99 | latency percentile — the tail is where saturation shows |
| Max | slowest request of the level |
| Failed | transport errors (see breakdown) + non-2xx/3xx responses |

**Saturation flag**: the first concurrency level where throughput gained <5%
over the previous level while average latency grew >25% — the point where
adding concurrency stops buying throughput and only buys latency.

## API

Base URL: `http://localhost:4000` (binds to localhost; set `HOST` to expose).

### `POST /api/load-test`

Runs the benchmark and returns the full result as JSON.

```json
{
  "url": "https://api.example.com/products",
  "method": "GET",
  "headers": { "Authorization": "Bearer ..." },
  "body": null,
  "totalRequests": 500,
  "concurrency": [10, 50, 100, 200, 500],
  "timeoutMs": 30000
}
```

Request limits: `totalRequests` 1–100,000; up to 10 concurrency levels of
1–1000; `timeoutMs` 500–120,000. Returns `{ url, method, results }` where each
result carries `concurrency, totalRequests, ok, fail, failures, statuses,
requestsPerSecond, avgMs, p50Ms, p95Ms, p99Ms, maxMs, elapsedMs`.

### `POST /api/load-test/stream` (SSE)

Same body; responds with `text/event-stream` events:
`start → (level_start, progress* , level_result)* → done` (or `aborted` /
`error`). The run aborts when the client disconnects.

### `GET /api/sample?delay=N`

Built-in sample endpoint for smoke-testing the tool (JSON after `N` ms,
capped at 5000).

### Concurrent runs

Only one benchmark runs at a time; a second run gets **HTTP 409** with an
explanatory message. Overlapping runs would distort each other's
measurements.

## Safety

The server binds to `localhost` by default because it will fire arbitrary
requests at any URL it's given. Set `HOST=0.0.0.0` only on trusted networks.
