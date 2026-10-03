import type { ReactElement } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  LabelList,
} from 'recharts';
import { fmtNum } from '../stats';
import type { LevelResult } from '../types';

/**
 * Two small-multiple line charts that share the x-axis (concurrency):
 *  - throughput (req/s), one series -> no legend, the title names it
 *  - latency percentiles (P50/P95/P99), three categorical series -> legend
 *
 * Deliberately NOT a dual-axis chart: the two measures have different units,
 * so they get their own charts.
 */

const SERIES = {
  p50: 'var(--series-1)',
  p95: 'var(--series-2)',
  p99: 'var(--series-3)',
} as const;

/** Shape of the props the parent reads back off each `<Line>` child. */
interface LineSpecProps {
  dataKey: string;
  name: string;
  color: string;
}

type LineSpec = ReactElement<LineSpecProps>;

interface ChartsProps {
  results: LevelResult[];
  saturation: number;
}

export default function Charts({ results, saturation }: ChartsProps) {
  const satConcurrency = saturation >= 0 ? results[saturation].concurrency : null;

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        title="Throughput"
        subtitle="requests per second by concurrency level"
        results={results}
        saturation={satConcurrency}
      >
        <Line dataKey="requestsPerSecond" name="Req/s" color="var(--series-1)" />
      </ChartCard>

      <ChartCard
        title="Latency percentiles"
        subtitle="P50 / P95 / P99 in milliseconds"
        results={results}
        saturation={satConcurrency}
        legend
      >
        <Line dataKey="p50Ms" name="P50" color={SERIES.p50} />
        <Line dataKey="p95Ms" name="P95" color={SERIES.p95} />
        <Line dataKey="p99Ms" name="P99" color={SERIES.p99} />
      </ChartCard>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  subtitle: string;
  results: LevelResult[];
  saturation: number | null;
  legend?: boolean;
  children: LineSpec | LineSpec[];
}

function ChartCard({ title, subtitle, results, saturation, legend, children }: ChartCardProps) {
  // Recharts <Line> props aren't statically known to match LineSpecProps;
  // the parent always passes dataKey/name/color, so the cast is safe.
  const lines = (Array.isArray(children) ? children : [children]) as LineSpec[];
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <header>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mb-2.5 mt-0.5 text-xs text-ink-3">{subtitle}</p>
      </header>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={results} margin={{ top: 12, right: 72, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="concurrency"
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            tickLine={false}
            label={{ value: 'concurrency', position: 'insideBottomRight', offset: -2, fill: 'var(--chart-muted)', fontSize: 11 }}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            tickLine={false}
            width={56}
            tickFormatter={(v) => fmtNum(Number(v))}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--chart-axis)' }} />
          {saturation != null && (
            <ReferenceLine
              x={saturation}
              stroke="var(--status-serious)"
              strokeDasharray="4 4"
              label={{
                value: 'saturation',
                position: 'insideTopLeft',
                fill: 'var(--status-serious)',
                fontSize: 11,
              }}
            />
          )}
          {lines.map((line) => (
            <Line
              key={line.props.dataKey}
              type="monotone"
              dataKey={line.props.dataKey}
              name={line.props.name}
              stroke={line.props.color}
              strokeWidth={2}
              dot={{ r: 4, fill: line.props.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            >
              {/* Direct label on the last point only — never a number on every point */}
              <LabelList dataKey={line.props.dataKey} content={endLabelFor(results.length)} />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
      {legend && (
        <ul className="mt-2.5 flex list-none gap-3.5 p-0 text-xs text-ink-2" aria-hidden="false">
          {lines.map((line) => (
            <li key={line.props.dataKey} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: line.props.color }} />
              {line.props.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface EndLabelProps {
  x?: number | string;
  y?: number | string;
  index?: number;
  value?: number | string;
}

/** Direct label that renders only on the final data point, right of the mark. */
function endLabelFor(total: number) {
  return function EndLabel({ x, y, index, value }: EndLabelProps) {
    if (index !== total - 1) return null;
    return (
      <text x={Number(x ?? 0) + 10} y={Number(y ?? 0) + 4} fill="var(--chart-ink)" fontSize={11}>
        {fmtNum(Number(value ?? 0))}
      </text>
    );
  };
}

interface TooltipEntry {
  dataKey: string | number;
  name?: string | number;
  stroke?: string;
  value?: number | string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-ink shadow-lg">
      <div className="mb-1 font-semibold">concurrency {label}</div>
      {payload.map((p) => (
        <div className="flex items-center gap-1.5" key={p.dataKey}>
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.stroke }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="ml-auto tabular-nums">{fmtNum(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}
