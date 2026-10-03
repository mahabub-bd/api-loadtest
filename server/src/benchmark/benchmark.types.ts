/** Shared types for the benchmark engine and its controller. */

export interface BenchmarkConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  totalRequests: number;
  concurrency: number[];
  timeoutMs: number;
}

export interface FailureCounts {
  timeout: number;
  dns: number;
  connect: number;
  aborted: number;
  other: number;
}

/** One concurrency level's aggregate result (SSE `level_result` / final `done`). */
export interface LevelResult {
  concurrency: number;
  totalRequests: number;
  ok: number;
  fail: number;
  failures: FailureCounts;
  statuses: Record<string, number>;
  requestsPerSecond: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  elapsedMs: number;
}

export interface BenchmarkHooks {
  onLevelStart?(data: { concurrency: number; totalRequests: number }): void;
  onProgress?(data: {
    concurrency: number;
    completed: number;
    ok: number;
    fail: number;
    elapsedMs: number;
  }): void;
  onLevelResult?(result: LevelResult): void;
}
