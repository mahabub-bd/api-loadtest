import { fmtNum } from '../stats';
import type { LevelResult } from '../types';

type MetricKey =
  | 'concurrency'
  | 'ok'
  | 'fail'
  | 'requestsPerSecond'
  | 'avgMs'
  | 'p50Ms'
  | 'p95Ms'
  | 'p99Ms'
  | 'maxMs';

const COLS: { key: MetricKey; label: string }[] = [
  { key: 'concurrency', label: 'Concurrency' },
  { key: 'ok', label: 'OK' },
  { key: 'fail', label: 'Failed' },
  { key: 'requestsPerSecond', label: 'Req/s' },
  { key: 'avgMs', label: 'Avg' },
  { key: 'p50Ms', label: 'P50' },
  { key: 'p95Ms', label: 'P95' },
  { key: 'p99Ms', label: 'P99' },
  { key: 'maxMs', label: 'Max' },
];

interface ResultsTableProps {
  results: LevelResult[];
  saturationIndex: number;
}

/** One-line "why did these fail" summary for the Failed cell's tooltip. */
function failSummary(r: LevelResult): string | undefined {
  if (!r.fail) return undefined;
  const parts: string[] = [];
  for (const [cause, count] of Object.entries(r.failures ?? {})) {
    if (count) parts.push(`${cause} ${count}`);
  }
  for (const [code, count] of Object.entries(r.statuses ?? {})) {
    parts.push(`HTTP ${code} ×${count}`);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

export default function ResultsTable({ results, saturationIndex }: ResultsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full border-collapse text-sm whitespace-nowrap">
        <thead>
          <tr className="bg-surface-2 text-xs text-ink-2">
            {COLS.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="border-b border-line px-3.5 py-2.5 text-right font-medium first:text-left"
              >
                {c.label}
                {c.key.endsWith('Ms') && <small className="font-normal text-ink-3"> ms</small>}
              </th>
            ))}
            <th scope="col" className="border-b border-line px-3.5 py-2.5">
              <span className="sr-only">Notes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr
              key={r.concurrency}
              className={`transition-colors ${i === saturationIndex ? 'bg-warn-bg' : 'hover:bg-surface-2/60'}`}
            >
              {COLS.map((c) => (
                <td
                  key={c.key}
                  title={c.key === 'fail' ? failSummary(r) : undefined}
                  className={`border-b border-line px-3.5 py-2 text-right tabular-nums first:text-left ${
                    c.key === 'fail' && r.fail ? 'font-medium text-danger-ink' : ''
                  }`}
                >
                  {fmtNum(r[c.key])}
                </td>
              ))}
              <td className="border-b border-line px-3.5 py-2">
                {i === saturationIndex && (
                  <span className="inline-block rounded-full border border-warn-line px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warn-ink">
                    <span aria-hidden="true">⚠</span> saturation
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
