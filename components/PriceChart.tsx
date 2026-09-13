import type { PricePoint } from "@/lib/market";

/**
 * Inline-SVG line chart of YES price over time. Pure (no client JS, no libs).
 * Points are spaced evenly by index; y axis is 0–100%.
 */
export default function PriceChart({ points }: { points: PricePoint[] }) {
  const W = 640;
  const H = 200;
  const padX = 8;
  const padY = 12;

  const ys = points.map((p) => Number(p.price_yes));
  if (ys.length === 0) {
    return <p className="muted">No price history yet.</p>;
  }
  // Ensure at least two points so we can draw a line.
  const series = ys.length === 1 ? [ys[0]!, ys[0]!] : ys;

  const x = (i: number) =>
    padX + (i * (W - 2 * padX)) / (series.length - 1);
  const y = (v: number) => padY + (1 - v) * (H - 2 * padY);

  const line = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${padX},${H - padY} ${line} ${W - padX},${H - padY}`;
  const last = series[series.length - 1]!;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="YES price history">
        <defs>
          <linearGradient id="pcfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--yes)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--yes)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 25/50/75% guide lines */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={padX}
            x2={W - padX}
            y1={y(g)}
            y2={y(g)}
            stroke="var(--border)"
            strokeDasharray="4 6"
            strokeWidth="1"
          />
        ))}
        <polygon points={area} fill="url(#pcfill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--yes)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(series.length - 1)} cy={y(last)} r="4" fill="var(--yes)" />
      </svg>
      <div className="chart-axis muted">
        <span>YES {(last * 100).toFixed(0)}%</span>
        <span>{points.length} point{points.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}
