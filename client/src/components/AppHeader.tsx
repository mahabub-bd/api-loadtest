import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

type ServerState = 'checking' | 'online' | 'offline';

/**
 * Lightweight health probe against the benchmark server (through the Vite
 * proxy in dev, same origin in prod). Polls every 30s so a stopped server is
 * visible up front instead of surfacing as a 502 when a run is submitted.
 */
function useServerStatus(): ServerState {
  const [state, setState] = useState<ServerState>('checking');

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch('/api/sample?delay=0', { signal: controller.signal });
        if (!cancelled) setState(res.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) setState('offline');
      } finally {
        clearTimeout(timer);
      }
    }
    check();
    const id = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}

const PILL_CLASS: Record<ServerState, string> = {
  checking: 'border-line bg-surface-2 text-ink-3',
  online: 'border-ok-line bg-ok-bg text-ok-ink',
  offline: 'border-danger-line bg-danger-bg text-danger-ink',
};

const DOT_CLASS: Record<ServerState, string> = {
  checking: 'bg-ink-3',
  online: 'bg-ok-dot',
  offline: 'bg-danger-ink',
};

const STATUS_LABEL: Record<ServerState, string> = {
  checking: 'Checking server…',
  online: 'Benchmark server online',
  offline: 'Benchmark server offline',
};

export default function AppHeader() {
  const status = useServerStatus();

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-4.5 w-4.5"
            aria-hidden="true"
          >
            <path d="M4.9 15a8 8 0 1 1 14.2 0" />
            <path d="M12 15l3.5-4.5" />
            <path d="M2.5 19h19" />
          </svg>
        </div>
        <div className="min-w-0 leading-tight">
          <span className="block text-sm font-bold tracking-tight">API Load Tester</span>
          <span className="hidden text-xs text-ink-3 sm:block">
            Node-powered concurrency benchmarks
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex ${PILL_CLASS[status]}`}
          role="status"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[status]} ${status === 'checking' ? 'animate-pulse' : ''}`}
            aria-hidden="true"
          />
          {STATUS_LABEL[status]}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
