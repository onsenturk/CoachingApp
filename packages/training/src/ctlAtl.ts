/**
 * Chronic / Acute Training Load (Banister exponential moving averages).
 *   CTL (fitness): 42-day EMA of daily TSS/TRIMP
 *   ATL (fatigue): 7-day EMA
 *   TSB (form):    CTL_yesterday - ATL_yesterday
 */

export interface DailyLoad {
  date: string; // YYYY-MM-DD
  load: number; // TSS or TRIMP for the day
}

export interface LoadCurve {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

const CTL_TC = 42;
const ATL_TC = 7;

function ema(prev: number, today: number, tc: number): number {
  const alpha = 2 / (tc + 1);
  return today * alpha + prev * (1 - alpha);
}

export function computeCtlAtl(daily: DailyLoad[], seedCtl = 0, seedAtl = 0): LoadCurve[] {
  const out: LoadCurve[] = [];
  let ctl = seedCtl;
  let atl = seedAtl;
  for (const d of daily) {
    const yCtl = ctl;
    const yAtl = atl;
    ctl = ema(ctl, d.load, CTL_TC);
    atl = ema(atl, d.load, ATL_TC);
    out.push({
      date: d.date,
      ctl,
      atl,
      tsb: yCtl - yAtl,
    });
  }
  return out;
}

export function consecutiveDaysTsbBelow(curve: LoadCurve[], threshold: number): number {
  let count = 0;
  for (let i = curve.length - 1; i >= 0; i--) {
    if (curve[i]!.tsb < threshold) count++;
    else break;
  }
  return count;
}
