/**
 * HR / pace / power zone derivation.
 */

export interface HrZones {
  z1Max: number; // recovery
  z2Max: number; // endurance
  z3Max: number; // tempo
  z4Max: number; // threshold
  z5Max: number; // VO2
}

/** Karvonen-style 5-zone split using HRR (heart-rate reserve). */
export function hrZonesFromMaxAndRest(maxHr: number, restingHr: number): HrZones {
  const hrr = maxHr - restingHr;
  const at = (frac: number) => Math.round(restingHr + hrr * frac);
  return {
    z1Max: at(0.6),
    z2Max: at(0.7),
    z3Max: at(0.8),
    z4Max: at(0.9),
    z5Max: maxHr,
  };
}

export type HrZoneId = "z1" | "z2" | "z3" | "z4" | "z5";

export function classifyHr(hr: number, z: HrZones): HrZoneId {
  if (hr <= z.z1Max) return "z1";
  if (hr <= z.z2Max) return "z2";
  if (hr <= z.z3Max) return "z3";
  if (hr <= z.z4Max) return "z4";
  return "z5";
}

export interface PowerZones {
  z1Max: number;
  z2Max: number;
  z3Max: number;
  z4Max: number;
  z5Max: number;
  z6Max: number;
  z7Max: number;
}

/** Coggan 7-zone power model from FTP. */
export function powerZonesFromFtp(ftp: number): PowerZones {
  return {
    z1Max: Math.round(ftp * 0.55),
    z2Max: Math.round(ftp * 0.75),
    z3Max: Math.round(ftp * 0.9),
    z4Max: Math.round(ftp * 1.05),
    z5Max: Math.round(ftp * 1.2),
    z6Max: Math.round(ftp * 1.5),
    z7Max: Math.round(ftp * 3.0),
  };
}
