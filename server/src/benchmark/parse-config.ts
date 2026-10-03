import { BadRequestException } from '@nestjs/common';
import type { BenchmarkConfig } from './benchmark.types';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Validate/normalize the benchmark request. Throws BadRequestException with a
 * user-facing message (surfaced to the client as `{ error: message }`).
 */
export function parseConfig(input: unknown): BenchmarkConfig {
  const body = (input ?? {}) as Record<string, unknown>;
  const cfg: BenchmarkConfig = {
    url: '',
    method: 'GET',
    headers: {},
    body: null,
    totalRequests: 0,
    concurrency: [],
    timeoutMs: 0,
  };

  let url: URL;
  try {
    url = new URL(String(body.url ?? ''));
  } catch {
    throw new BadRequestException('A valid absolute http(s) URL is required.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('Only http:// and https:// URLs are supported.');
  }
  cfg.url = url.toString();

  cfg.method = String(body.method ?? 'GET').toUpperCase();
  if (!METHODS.has(cfg.method)) {
    throw new BadRequestException(`Method must be one of: ${[...METHODS].join(', ')}.`);
  }

  if (body.headers != null && typeof body.headers !== 'object') {
    throw new BadRequestException('headers must be a JSON object.');
  }
  cfg.headers = {};
  for (const [k, v] of Object.entries(body.headers as Record<string, unknown> ?? {})) {
    if (v != null) cfg.headers[k] = String(v);
  }

  cfg.body = body.body ?? null;
  if (cfg.body != null && typeof cfg.body !== 'string' && typeof cfg.body !== 'object') {
    throw new BadRequestException('body must be a JSON value or null.');
  }

  cfg.totalRequests = Math.floor(Number(body.totalRequests ?? 500));
  if (!Number.isFinite(cfg.totalRequests) || cfg.totalRequests < 1 || cfg.totalRequests > 100_000) {
    throw new BadRequestException('totalRequests must be between 1 and 100000.');
  }

  const rawLevels: unknown = body.concurrency ?? [10, 50, 100, 200, 500];
  if (!Array.isArray(rawLevels)) {
    throw new BadRequestException('concurrency must be an array of numbers.');
  }
  const levels = [...new Set(rawLevels.map((n) => Math.floor(Number(n))))].filter(
    (n) => Number.isFinite(n) && n >= 1 && n <= 1000
  );
  levels.sort((a, b) => a - b);
  if (levels.length === 0) throw new BadRequestException('Provide at least one concurrency level (1-1000).');
  if (levels.length > 10) throw new BadRequestException('At most 10 concurrency levels per run.');
  cfg.concurrency = levels;

  cfg.timeoutMs = Math.floor(Number(body.timeoutMs ?? 30_000));
  if (!Number.isFinite(cfg.timeoutMs) || cfg.timeoutMs < 500 || cfg.timeoutMs > 120_000) {
    throw new BadRequestException('timeoutMs must be between 500 and 120000.');
  }

  return cfg;
}
