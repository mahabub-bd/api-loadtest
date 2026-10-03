import { Injectable } from '@nestjs/common';
import { Agent, request } from 'undici';
import type { BenchmarkConfig, BenchmarkHooks, LevelResult } from './benchmark.types';

/**
 * Benchmark engine.
 *
 * Each concurrency level gets its own undici Agent with `connections: concurrency`
 * and `pipelining: 1` — i.e. one kept-alive TCP connection per in-flight request,
 * which mirrors how a load generator (not a browser) should behave.
 *
 * Latency is measured from dispatch to fully-consumed response, so it includes
 * connection setup on the first wave, TTFB and body download. A short unmeasured
 * warmup wave per level pays TCP/TLS setup and DNS before the clock starts, so
 * percentiles reflect steady-state, not the first handshake.
 *
 * Failures are classified (timeout / dns / connect / aborted / other) and
 * non-2xx/3xx statuses are counted per code, so a failing run answers "why".
 *
 * The service also owns the run lock: measurements from two overlapping runs
 * would distort each other, so the controller checks isRunning() before starting.
 */

/** Unmeasured requests fired per level to open sockets before timing starts. */
const WARMUP_REQUESTS = 5;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Linear-interpolated percentile over a sorted array of numbers. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Bucket a request error into a small, displayable set of causes. */
function classifyError(err: unknown): keyof LevelResult['failures'] {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'ETIMEDOUT'
  ) {
    return 'timeout';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
  if (code === 'ABORT_ERR' || (err as { name?: string } | null)?.name === 'AbortError') {
    return 'aborted';
  }
  if (code.startsWith('ECONN') || code === 'EPIPE' || code === 'UND_ERR_SOCKET') return 'connect';
  return 'other';
}

@Injectable()
export class BenchmarkService {
  private runActive = false;

  isRunning(): boolean {
    return this.runActive;
  }

  /**
   * Run all concurrency levels sequentially. Aborting the signal stops the
   * run between requests; the lock is released whichever way it ends.
   */
  async run(
    cfg: BenchmarkConfig,
    hooks: BenchmarkHooks = {},
    signal?: AbortSignal
  ): Promise<LevelResult[]> {
    this.runActive = true;
    try {
      const results: LevelResult[] = [];
      for (const concurrency of cfg.concurrency) {
        if (signal?.aborted) break;
        hooks.onLevelStart?.({ concurrency, totalRequests: cfg.totalRequests });
        const result = await this.runLevel(cfg, concurrency, hooks.onProgress, signal);
        hooks.onLevelResult?.(result);
        results.push(result);
      }
      return results;
    } finally {
      this.runActive = false;
    }
  }

  /**
   * Fire a single request and drain the body. Resolves with the HTTP status;
   * throws on transport errors. Shared by measured workers and the warmup wave.
   */
  private async performRequest(
    agent: Agent,
    cfg: BenchmarkConfig,
    hasBody: boolean,
    signal: AbortSignal | undefined
  ): Promise<number> {
    const reqHeaders: Record<string, string> = { ...cfg.headers };
    if (hasBody) {
      reqHeaders['content-type'] = reqHeaders['content-type'] ?? 'application/json';
    }
    const res = await request(cfg.url, {
      method: cfg.method as never,
      headers: reqHeaders,
      ...(hasBody
        ? { body: typeof cfg.body === 'string' ? cfg.body : JSON.stringify(cfg.body) }
        : {}),
      dispatcher: agent,
      headersTimeout: cfg.timeoutMs,
      bodyTimeout: cfg.timeoutMs,
      signal,
    });
    // Drain the body so keep-alive sockets get reused and the
    // measurement reflects the full response, not just the headers.
    await res.body.dump();
    return res.statusCode;
  }

  private async runLevel(
    cfg: BenchmarkConfig,
    concurrency: number,
    onProgress: BenchmarkHooks['onProgress'],
    signal: AbortSignal | undefined
  ): Promise<LevelResult> {
    const { totalRequests } = cfg;

    const agent = new Agent({
      connections: concurrency,
      pipelining: 1,
      keepAliveTimeout: 10_000,
      keepAliveMaxTimeout: 10_000,
    });

    const latencies = new Array<number>(totalRequests);
    const failures = { timeout: 0, dns: 0, connect: 0, aborted: 0, other: 0 };
    const statuses: Record<string, number> = {};
    let dispatched = 0;
    let completed = 0;
    let ok = 0;
    let fail = 0;

    const startedAt = performance.now();
    let lastEmit = 0;

    const emitProgress = (force = false) => {
      if (!onProgress) return;
      const now = performance.now();
      if (!force && now - lastEmit < 200) return;
      lastEmit = now;
      onProgress({
        concurrency,
        completed,
        ok,
        fail,
        elapsedMs: round1(now - startedAt),
      });
    };

    const hasBody = cfg.body != null && cfg.method !== 'GET' && cfg.method !== 'HEAD';

    // Warmup: pay connection setup / DNS / TLS outside the measurement so
    // percentiles reflect steady-state. Scaled down for tiny runs so a
    // totalRequests=1 smoke test doesn't hit the target five extra times.
    const warmupCount = Math.min(WARMUP_REQUESTS, totalRequests);
    await Promise.all(
      Array.from({ length: warmupCount }, () =>
        this.performRequest(agent, cfg, hasBody, signal).catch(() => {})
      )
    );

    const worker = async (): Promise<void> => {
      while (!signal?.aborted) {
        const i = dispatched;
        if (i >= totalRequests) return;
        dispatched++;

        const t0 = performance.now();
        try {
          const status = await this.performRequest(agent, cfg, hasBody, signal);
          if (status >= 200 && status < 400) ok++;
          else {
            fail++;
            statuses[status] = (statuses[status] ?? 0) + 1;
          }
        } catch (err) {
          fail++;
          failures[classifyError(err)]++;
        }

        latencies[i] = performance.now() - t0;
        completed++;
        emitProgress();
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker())
    );

    emitProgress(true);
    await agent.close().catch(() => {});

    const elapsedMs = performance.now() - startedAt;
    const measured = latencies.slice(0, completed).sort((a, b) => a - b);
    const total = completed;
    const sum = measured.reduce((acc, v) => acc + v, 0);

    return {
      concurrency,
      totalRequests: total,
      ok,
      fail,
      failures,
      statuses,
      requestsPerSecond: elapsedMs > 0 ? round1((total / elapsedMs) * 1000) : 0,
      avgMs: total ? round1(sum / total) : 0,
      p50Ms: round1(percentile(measured, 0.5)),
      p95Ms: round1(percentile(measured, 0.95)),
      p99Ms: round1(percentile(measured, 0.99)),
      maxMs: total ? round1(measured[measured.length - 1]) : 0,
      elapsedMs: round1(elapsedMs),
    };
  }
}
