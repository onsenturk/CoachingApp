/**
 * TSS (Training Stress Score) — Coggan.
 * TSS = (sec * NP * IF) / (FTP * 3600) * 100
 *   IF = NP / FTP
 */

export function normalizedPower(watts: number[]): number {
  if (watts.length < 30) return watts.reduce((a, b) => a + b, 0) / Math.max(1, watts.length);
  const window = 30; // 30s rolling avg
  const rolling: number[] = [];
  let sum = 0;
  for (let i = 0; i < watts.length; i++) {
    sum += watts[i]!;
    if (i >= window) sum -= watts[i - window]!;
    if (i >= window - 1) rolling.push(sum / window);
  }
  const fourthPow = rolling.reduce((acc, p) => acc + Math.pow(p, 4), 0) / rolling.length;
  return Math.pow(fourthPow, 0.25);
}

export interface TssInput {
  durationSec: number;
  normalizedPowerW: number;
  ftpW: number;
}

export function tss({ durationSec, normalizedPowerW, ftpW }: TssInput): number {
  if (ftpW <= 0) return 0;
  const intensityFactor = normalizedPowerW / ftpW;
  return ((durationSec * normalizedPowerW * intensityFactor) / (ftpW * 3600)) * 100;
}

export function intensityFactor(normalizedPowerW: number, ftpW: number): number {
  return ftpW > 0 ? normalizedPowerW / ftpW : 0;
}
