import type { PricePoint } from "@/lib/market";

/**
 * Inline-SVG line chart of the YES (Team A) win probability over time, with
 * exact numbers: a labelled y-axis (0–100%) and the value printed at each point.
 * Pure (no client JS, no libs). Points are spaced evenly by index.
 */
export default function PriceChart({
  points,
  yesLabel = "YES",
}: {
  points: PricePoint[];
  yesLabel?: string;
}) {
  const W = 680;
  const H = 230;
  const padL = 40;
  const padR = 16;
  const padT = 26;
  const padB = 22;

  const ys = points.map((p) => Number(p.price_yes));
  if (ys.length === 0) return <p className="muted">No price history yet.</p>;
  const series = ys.length === 1 ? [ys[0]!, ys[0]!] : ys;

  const x = (i: number) => padL + (i * (W - padL - padR)) / (series.length - 1);
  const y = (v: number) => padT + (1 - v) * (H - padT - padB);

  const line = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${padL},${H - padB} ${line} ${W - padR},${H - padB}`;
  const last = series[series.length - 1]!;

  // Label a subset of points to avoid clutter (always include the last).
  const step = Math.max(1, Math.ceil(series.length / 12));
  const labelAt = (i: number) => i % step === 0 || i === series.length - 1;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yesLabel} win probability history`}>
        <defs>
          <linearGradient id="pcfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--yes)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--yes)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* y-axis gridlines + exact % labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray="4 6" strokeWidth="1" />
            <text x={padL - 6} y={y(g) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
              {g * 100}%
            </text>
          </g>
        ))}

        <polygon points={area} fill="url(#pcfill)" />
        <polyline points={line} fill="none" stroke="var(--yes)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* dots + exact value labels */}
        {series.map((v, i) => {
          const isLast = i === series.length - 1;
          return (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r={isLast ? 4.5 : 2.6} fill="var(--yes)" />
              {(labelAt(i) || isLast) && (
                <text
                  x={x(i)}
                  y={y(v) - 8}
                  textAnchor={i === 0 ? "start" : isLast ? "end" : "middle"}
                  fontSize={isLast ? 12 : 10}
                  fontWeight={isLast ? 800 : 600}
                  fill={isLast ? "var(--yes)" : "var(--muted)"}
                >
                  {(v * 100).toFixed(1)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-axis muted">
        <span>{yesLabel} now: <b style={{ color: "var(--yes)" }}>{(last * 100).toFixed(1)}%</b></span>
        <span>{points.length} point{points.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}
