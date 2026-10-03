import { useState } from 'react';
import type { FormEvent } from 'react';
import type { LoadTestConfig } from '../types';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

interface HeaderEntry {
  key: string;
  value: string;
}

interface ConfigFormProps {
  initial: LoadTestConfig;
  running: boolean;
  onSubmit: (config: LoadTestConfig) => void;
  onCancel: () => void;
}

export default function ConfigForm({ initial, running, onSubmit, onCancel }: ConfigFormProps) {
  const [url, setUrl] = useState(initial.url);
  const [method, setMethod] = useState(initial.method);
  const [headers, setHeaders] = useState<HeaderEntry[]>(entriesFromObject(initial.headers));
  const [body, setBody] = useState(initial.body ? JSON.stringify(initial.body, null, 2) : '');
  const [totalRequests, setTotalRequests] = useState<string>(String(initial.totalRequests));
  const [concurrency, setConcurrency] = useState(initial.concurrency.join(', '));
  const [timeoutMs, setTimeoutMs] = useState<string>(String(initial.timeoutMs));
  const [error, setError] = useState('');

  const hasBody = BODY_METHODS.has(method);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    let parsedBody: unknown = null;
    if (hasBody && body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        setError('Request body is not valid JSON.');
        return;
      }
    }

    const levels = concurrency
      .split(/[\s,]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (levels.length === 0) {
      setError('Provide at least one concurrency level, e.g. "10, 50, 100".');
      return;
    }

    const headerObj: Record<string, string> = {};
    for (const { key, value } of headers) {
      if (key.trim()) headerObj[key.trim()] = value;
    }

    onSubmit({
      url: url.trim(),
      method,
      headers: headerObj,
      body: parsedBody,
      totalRequests: Math.max(1, parseInt(totalRequests, 10) || 500),
      concurrency: levels,
      timeoutMs: Math.max(500, parseInt(timeoutMs, 10) || 30000),
    });
  }

  function updateHeader(index: number, field: keyof HeaderEntry, value: string) {
    setHeaders(headers.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  return (
    <form id="config-form" className="space-y-3" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-2">API URL</span>
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/products"
          disabled={running}
          className="field"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-2">Method</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          disabled={running}
          className="field"
        >
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>

      <div>
        <span className="mb-1 block text-xs font-medium text-ink-2">Headers</span>
        {headers.map((h, i) => (
          <div className="mb-1.5 flex gap-1.5" key={i}>
            <input
              placeholder="Header"
              value={h.key}
              disabled={running}
              onChange={(e) => updateHeader(i, 'key', e.target.value)}
              className="field min-w-0 flex-1"
            />
            <input
              placeholder="Value"
              value={h.value}
              disabled={running}
              onChange={(e) => updateHeader(i, 'value', e.target.value)}
              className="field min-w-0 flex-1"
            />
            <button
              type="button"
              aria-label={`Remove header ${h.key || i + 1}`}
              disabled={running}
              onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
              className="shrink-0 rounded-lg border border-line bg-surface px-2.5 text-ink-3 transition-colors hover:border-danger-line hover:text-danger-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-danger-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={running}
          onClick={() => setHeaders([...headers, { key: '', value: '' }])}
          className="text-sm font-medium text-accent transition-colors hover:text-accent-strong hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add header
        </button>
      </div>

      {hasBody && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-2">JSON body</span>
          <textarea
            rows={6}
            value={body}
            placeholder='{ "name": "example" }'
            onChange={(e) => setBody(e.target.value)}
            disabled={running}
            spellCheck={false}
            className="field font-mono"
          />
        </label>
      )}

      <div className="flex gap-2.5">
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-ink-2">Requests per level</span>
          <input
            type="number"
            min={1}
            max={100000}
            value={totalRequests}
            onChange={(e) => setTotalRequests(e.target.value)}
            disabled={running}
            className="field"
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium text-ink-2">Timeout (ms)</span>
          <input
            type="number"
            min={500}
            max={120000}
            step={500}
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
            disabled={running}
            className="field"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-2">
          Concurrency levels <span className="font-normal text-ink-3">(comma-separated, run sequentially)</span>
        </span>
        <input
          type="text"
          value={concurrency}
          onChange={(e) => setConcurrency(e.target.value)}
          disabled={running}
          className="field"
        />
      </label>

      {error && (
        <div
          className="rounded-lg border border-danger-line bg-danger-bg px-2.5 py-2 text-[13px] text-danger-ink"
          role="alert"
        >
          {error}
        </div>
      )}

      {running ? (
        <button type="button" onClick={onCancel} className="btn-danger w-full">
          Stop run
        </button>
      ) : (
        <>
          <button type="submit" className="btn-primary w-full" title="Ctrl/⌘ + Enter">
            Run benchmark
          </button>
          <p className="text-center text-xs text-ink-3">
            Tip: press <kbd className="font-medium text-ink-2">Ctrl/⌘</kbd> +{' '}
            <kbd className="font-medium text-ink-2">Enter</kbd> to re-run
          </p>
        </>
      )}
    </form>
  );
}

function entriesFromObject(obj: Record<string, string> | undefined): HeaderEntry[] {
  const entries = Object.entries(obj ?? {}).map(([key, value]) => ({ key, value: String(value) }));
  return entries.length ? entries : [{ key: '', value: '' }];
}
