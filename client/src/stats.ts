/**
 * Result analysis + export helpers.
 */
import type { LevelResult, LoadTestConfig } from './types';

/**
 * Flag the saturation point: the first level where throughput gained less
 * than 5% over the previous level while average latency kept growing
 * significantly (>25%). Returns the index into results, or -1.
 */
export function detectSaturation(results: LevelResult[]): number {
  for (let i = 1; i < results.length; i++) {
    const prev = results[i - 1];
    const cur = results[i];
    const gain =
      prev.requestsPerSecond > 0
        ? (cur.requestsPerSecond - prev.requestsPerSecond) / prev.requestsPerSecond
        : 0;
    const latencyGrew = cur.avgMs > prev.avgMs * 1.25;
    if (gain < 0.05 && latencyGrew) return i;
  }
  return -1;
}

export function toCSV(results: LevelResult[]): string {
  const header: (keyof LevelResult)[] = [
    'concurrency',
    'ok',
    'fail',
    'requestsPerSecond',
    'avgMs',
    'p50Ms',
    'p95Ms',
    'p99Ms',
    'maxMs',
    'elapsedMs',
  ];
  const rows = results.map((r) =>
    header
      .map((k) => {
        const v = r[k];
        return typeof v === 'number' ? String(v) : '';
      })
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export function exportJSON(config: LoadTestConfig, results: LevelResult[], saturationIndex: number): void {
  const payload = {
    generatedAt: new Date().toISOString(),
    request: {
      url: config.url,
      method: config.method,
      headers: config.headers,
      body: config.body,
      totalRequests: config.totalRequests,
      timeoutMs: config.timeoutMs,
    },
    concurrency: config.concurrency,
    saturationConcurrency:
      saturationIndex >= 0 ? results[saturationIndex].concurrency : null,
    results,
  };
  download(
    `load-test-${timestamp()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
}

export function exportCSV(results: LevelResult[]): void {
  download(`load-test-${timestamp()}.csv`, toCSV(results), 'text/csv');
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const fmtMs = (v: number): string =>
  v >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} s` : `${Math.round(v)} ms`;

export const fmtNum = (v: number): string => v.toLocaleString(undefined, { maximumFractionDigits: 1 });
