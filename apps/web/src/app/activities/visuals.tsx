/**
 * Pure SVG, server-rendered visuals — no client JS, no chart library.
 * All inputs come from server components (Prisma).
 */
import { sportStyle } from "./activityFormat";

export function SportBadge({ sportType }: { sportType: string }) {
  const s = sportStyle(sportType);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${s.bg} ${s.text} ${s.ring}`}
    >
      <span aria-hidden>{s.emoji}</span>
      <span>{sportType}</span>
    </span>
  );
}

type WeeklyDay = { date: string; meters: number };

/**
 * Bar chart of last 7 days of distance. Today is rightmost.
 */
export function WeeklyVolumeChart({ days }: { days: WeeklyDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.meters));
  const totalKm = days.reduce((a, d) => a + d.meters, 0) / 1000;
  const W = 320;
  const H = 100;
  const padX = 8;
  const padTop = 8;
  const padBottom = 18;
  const barAreaH = H - padTop - padBottom;
  const barW = (W - padX * 2) / days.length - 4;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Last 7 days</span>
        <span className="text-sm font-semibold text-neutral-800">
          {totalKm.toFixed(1)} km
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weekly volume">
        {/* baseline */}
        <line
          x1={padX}
          x2={W - padX}
          y1={H - padBottom}
          y2={H - padBottom}
          stroke="#e5e5e5"
          strokeWidth={1}
        />
        {days.map((d, i) => {
          const h = (d.meters / 1000 / (max / 1000)) * barAreaH;
          const x = padX + i * ((W - padX * 2) / days.length) + 2;
          const y = H - padBottom - h;
          const dt = new Date(d.date);
          const wd = ["S", "M", "T", "W", "T", "F", "S"][dt.getUTCDay()];
          const isToday = i === days.length - 1;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(1, h)}
                rx={2}
                fill={isToday ? "#0ea5e9" : "#7dd3fc"}
              >
                <title>
                  {d.date}: {(d.meters / 1000).toFixed(1)} km
                </title>
              </rect>
              <text
                x={x + barW / 2}
                y={H - 4}
                textAnchor="middle"
                fontSize={9}
                fill={isToday ? "#0c4a6e" : "#737373"}
                fontWeight={isToday ? 700 : 400}
              >
                {wd}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type SportSlice = { sportType: string; meters: number };

/**
 * Donut chart of sport mix (by distance) for last N days.
 */
export function SportMixDonut({
  slices,
  totalLabel = "Total",
}: {
  slices: SportSlice[];
  totalLabel?: string;
}) {
  const total = slices.reduce((a, s) => a + s.meters, 0);
  const size = 140;
  const r = 56;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 18;
  const C = 2 * Math.PI * r;

  if (total === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-xs text-neutral-400">
        No activities yet
      </div>
    );
  }

  // Sort largest first, cap to 6 slices, group rest as "Other".
  const sorted = [...slices].sort((a, b) => b.meters - a.meters);
  const top = sorted.slice(0, 6);
  const otherMeters = sorted.slice(6).reduce((a, s) => a + s.meters, 0);
  if (otherMeters > 0) top.push({ sportType: "Other", meters: otherMeters });

  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-32 w-32 shrink-0 -rotate-90"
        role="img"
        aria-label="Sport mix"
      >
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f5f5f5" strokeWidth={stroke} />
        {top.map((s) => {
          const frac = s.meters / total;
          const dash = frac * C;
          const el = (
            <circle
              key={s.sportType}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={sportStyle(s.sportType).hex}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
            >
              <title>
                {s.sportType}: {(s.meters / 1000).toFixed(1)} km ({(frac * 100).toFixed(0)}%)
              </title>
            </circle>
          );
          offset += dash;
          return el;
        })}
        {/* center label (un-rotate) */}
        <g transform={`rotate(90 ${cx} ${cy})`}>
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            fontSize={18}
            fontWeight={700}
            fill="#171717"
          >
            {(total / 1000).toFixed(0)}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="#737373">
            km
          </text>
        </g>
      </svg>
      <ul className="flex-1 space-y-1 text-xs">
        {top.map((s) => {
          const pct = ((s.meters / total) * 100).toFixed(0);
          return (
            <li key={s.sportType} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: sportStyle(s.sportType).hex }}
                aria-hidden
              />
              <span className="flex-1 text-neutral-700">{s.sportType}</span>
              <span className="font-mono text-neutral-500">{pct}%</span>
            </li>
          );
        })}
        <li className="mt-1 border-t border-neutral-100 pt-1 text-[10px] text-neutral-400">
          {totalLabel} · last 30 days
        </li>
      </ul>
    </div>
  );
}

/**
 * Aggregate raw activities into 7 daily buckets ending today (UTC).
 */
export function bucketByDay(
  activities: Array<{ startDate: Date; distance: number }>,
  days = 7,
  sportFilter?: (a: { startDate: Date; distance: number }) => boolean,
): WeeklyDay[] {
  const out: WeeklyDay[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push({ date: d.toISOString().slice(0, 10), meters: 0 });
  }
  const idxByDate = new Map(out.map((b, i) => [b.date, i]));
  for (const a of activities) {
    if (sportFilter && !sportFilter(a)) continue;
    const key = a.startDate.toISOString().slice(0, 10);
    const idx = idxByDate.get(key);
    if (idx != null) out[idx].meters += a.distance;
  }
  return out;
}

/**
 * Aggregate by sportType totals.
 */
export function bucketBySport(
  activities: Array<{ sportType: string; distance: number }>,
): SportSlice[] {
  const m = new Map<string, number>();
  for (const a of activities) {
    m.set(a.sportType, (m.get(a.sportType) ?? 0) + a.distance);
  }
  return Array.from(m.entries()).map(([sportType, meters]) => ({ sportType, meters }));
}
