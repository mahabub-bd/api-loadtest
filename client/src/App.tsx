import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { streamLoadTest } from './api';
import AppFooter from './components/AppFooter';
import AppHeader from './components/AppHeader';
import ConfigForm from './components/ConfigForm';
import ResultsTable from './components/ResultsTable';
import { detectSaturation, exportCSV, exportJSON } from './stats';
import type { LevelResult, LoadTestConfig } from './types';

// Recharts is ~90% of the bundle; load it only once results exist.
const Charts = lazy(() => import('./components/Charts'));

const DEFAULT_CONFIG: LoadTestConfig = {
  // The default URL points at the server's built-in sample endpoint on
  // port 4000 (`/api/sample?delay=100`), so users can hit Run immediately.
  url: 'http://localhost:4000/api/sample?delay=100',
  method: 'GET',
  headers: {},
  body: null,
  totalRequests: 500,
  concurrency: [10, 50, 100, 200, 500],
  timeoutMs: 30000,
};

const CONFIG_STORAGE_KEY = 'loadtest.config';

/** Last-run config from localStorage, merged over the defaults. */
function loadPersistedConfig(): LoadTestConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<LoadTestConfig>;
    if (
      typeof parsed.url === 'string' &&
      typeof parsed.method === 'string' &&
      Array.isArray(parsed.concurrency)
    ) {
      return { ...DEFAULT_CONFIG, ...parsed } as LoadTestConfig;
    }
  } catch {
    /* corrupted or unavailable storage — fall back to defaults */
  }
  return DEFAULT_CONFIG;
}

interface ProgressState {
  completed: number;
  total: number;
  current: number | null;
}

/** host + path of the target URL for the results header chip. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + parsed.pathname;
  } catch {
    return url;
  }
}

export default function App() {
  const [results, setResults] = useState<LevelResult[]>([]);
  // Seed from the persisted last-run config so a reload restores the form.
  const [lastConfig, setLastConfig] = useState<LoadTestConfig>(loadPersistedConfig);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const abortedRef = useRef(false);

  // Saturation heuristic (detectSaturation in stats.js — not duplicated here):
  // flags the first level where throughput gain over the previous level is
  // <5% while avg latency grew >25% — a visible flag, not hidden math.
  const saturationIndex = useMemo(() => detectSaturation(results), [results]);

  function handleRun(config: LoadTestConfig) {
    setResults([]);
    setError('');
    // Keep the config that produced the current results so exports describe
    // the real run, not whatever is typed in the field later, and persist it
    // so a reload restores the form.
    setLastConfig(config);
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {
      /* persistence is best-effort */
    }
    // ConfigForm sends the full config object matching the server contract;
    // total work = totalRequests × concurrency levels.
    setProgress({ completed: 0, total: config.totalRequests * config.concurrency.length, current: null });
    setRunning(true);
    abortedRef.current = false;
    let levelOffset = 0;

    streamLoadTest(config, {
      // The "Stop run" button sets this flag so api.js's catch block
      // doesn't surface an intentional stop as an error.
      wasAborted: () => abortedRef.current,
      onLevelStart: (d) => {
        // Concurrency label in the progress bar; completed stays at the
        // last finished level's boundary until onLevelResult advances it.
        setProgress((prev) =>
          prev ? { ...prev, completed: levelOffset, current: d.concurrency } : prev
        );
      },
      // onProgress payload is per-level ({concurrency, completed, ok, fail,
      // elapsedMs}) and resets each level, so overall completed =
      // levelOffset + p.completed.
      onProgress: (p) => {
        setProgress((prev) =>
          prev ? { ...prev, completed: levelOffset + p.completed, current: p.concurrency } : prev
        );
      },
      // Levels arrive in order; append each one so the table fills in live.
      onLevelResult: (result) => {
        setResults((prev) => [...prev, result]);
        levelOffset += config.totalRequests;
        // Snap overall progress to the finished level's boundary.
        setProgress(() => ({
          completed: levelOffset,
          current: null,
          total: config.totalRequests * config.concurrency.length,
        }));
      },
      // onDone carries the authoritative full results from the server's
      // final event; it replaces the rows appended live by onLevelResult.
      onDone: (payload) => {
        setResults(payload.results);
        setProgress(null);
        setRunning(false);
      },
      // After a user "Stop run": keep partial results, clear progress.
      onAborted: () => {
        setProgress(null);
        setRunning(false);
      },
      // On error: keep partial results, stop spinner, clear progress.
      onError: (message) => {
        setError(message);
        setRunning(false);
        setProgress(null);
      },
    });
  }

  function handleCancel() {
    // Simplest cancellation: set the flag so api.js stops treating the
    // stream as live; closing the request makes the server see the
    // connection drop and abort the run.
    abortedRef.current = true;
    setRunning(false);
    setProgress(null);
  }

  // ⌘/Ctrl+Enter re-runs the benchmark with the form's current values via
  // requestSubmit, which runs the same validation + handler as the button.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !running) {
        e.preventDefault();
        (document.getElementById('config-form') as HTMLFormElement | null)?.requestSubmit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [running]);

  const progressPct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-page text-ink">
      <AppHeader />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="w-full shrink-0 border-b border-line bg-surface p-6 md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-96 md:overflow-y-auto md:border-b-0 md:border-r">
          <h2 className="mb-1 text-sm font-semibold">Benchmark configuration</h2>
          <p className="mb-5 text-[13px] leading-relaxed text-ink-2">
            Requests are fired from the Node.js benchmark server, not the browser, so CORS, browser
            connection limits and proxy behavior can't distort the measurements.
          </p>
          <ConfigForm
            initial={DEFAULT_CONFIG}
            running={running}
            onSubmit={handleRun}
            onCancel={handleCancel}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col p-6 md:p-8">
        {error && (
          <div
            className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger-line bg-danger-bg px-3.5 py-2.5 text-sm text-danger-ink"
            role="alert"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {progress && (
          <section className="mb-5">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px] text-ink-2">
              <span className="flex items-center gap-2">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                {progress.current != null
                  ? `Running at concurrency ${progress.current}`
                  : 'Finishing level'}
              </span>
              <span className="tabular-nums">
                {progress.completed.toLocaleString()} / {progress.total.toLocaleString()} ({progressPct}%)
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuenow={progress.completed}
              aria-valuemin={0}
              aria-valuemax={progress.total}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </section>
        )}

        {results.length > 0 ? (
          <>
            <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Results</h2>
                <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-3">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink-2">
                    {lastConfig.method}
                  </span>
                  <span className="max-w-72 truncate" title={lastConfig.url}>
                    {shortUrl(lastConfig.url)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {lastConfig.totalRequests.toLocaleString()} req × {results.length} levels
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => exportJSON(lastConfig, results, saturationIndex)}
                >
                  Export JSON
                </button>
                <button type="button" className="btn-secondary" onClick={() => exportCSV(results)}>
                  Export CSV
                </button>
              </div>
            </section>
            <ResultsTable results={results} saturationIndex={saturationIndex} />
            <Suspense
              fallback={
                <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="h-72 animate-pulse rounded-xl bg-surface-2" />
                  <div className="h-72 animate-pulse rounded-xl bg-surface-2" />
                </div>
              }
            >
              <Charts results={results} saturation={saturationIndex} />
            </Suspense>
          </>
        ) : (
          !running && (
            <div className="flex flex-1 items-center justify-center">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink-3">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />
                  </svg>
                </div>
                <h2 className="mb-1.5 text-base font-semibold">No results yet</h2>
                <p className="text-sm leading-relaxed text-ink-2">
                  Configure a target on the left and hit <strong className="font-semibold">Run benchmark</strong>.
                  The default points at the server's built-in <code className="font-mono text-[13px] text-ink">/api/sample</code> endpoint,
                  so you can try it right away.
                </p>
              </div>
            </div>
          )
        )}
      </main>
      </div>

      <AppFooter />
    </div>
  );
}
