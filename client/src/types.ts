/**
 * Shared types mirroring the benchmark server's request/SSE contract.
 */

/** POST body accepted by /api/load-test and /api/load-test/stream. */
export interface LoadTestConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown | null;
  totalRequests: number;
  concurrency: number[];
  timeoutMs: number;
}

/** One concurrency level's aggregate result (server `level_result` / final `done`). */
export interface LevelResult {
  concurrency: number;
  totalRequests: number;
  ok: number;
  fail: number;
  /** Failure causes from the benchmark server: timeout/dns/connect/aborted/other counts. */
  failures?: Partial<Record<'timeout' | 'dns' | 'connect' | 'aborted' | 'other', number>>;
  /** Non-2xx/3xx HTTP response counts by status code. */
  statuses?: Record<string, number>;
  requestsPerSecond: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  elapsedMs: number;
}

export interface StartPayload {
  url: string;
  method: string;
  totalRequests: number;
  concurrency: number[];
}

export interface LevelStartPayload {
  concurrency: number;
  totalRequests: number;
}

/** Per-level progress; `completed` resets to 0 at each level start. */
export interface ProgressPayload {
  concurrency: number;
  completed: number;
  ok: number;
  fail: number;
  elapsedMs: number;
}

export interface DonePayload {
  url: string;
  method: string;
  results: LevelResult[];
}

export interface LoadTestHandlers {
  onStart?: (payload: StartPayload) => void;
  onLevelStart?: (payload: LevelStartPayload) => void;
  onProgress?: (payload: ProgressPayload) => void;
  onLevelResult?: (result: LevelResult) => void;
  onDone?: (payload: DonePayload) => void;
  onAborted?: () => void;
  onError?: (message: string) => void;
  /** Called after a stream failure so an intentional stop isn't surfaced as an error. */
  wasAborted: () => boolean;
}
