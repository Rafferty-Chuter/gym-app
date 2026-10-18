/**
 * One-time repair of nights stored before S10 (pure). A phone set to
 * 12-hour time exports "11:53:00 PM" and "9:30:00 AM"; until S10 these
 * were read as 11:53 and as no time at all, so the wake time fell back to
 * the row's midnight, stored as "12:00". The asleep and awake minutes were
 * read correctly, so the missing end of the night follows from them: the
 * watch's sleep period is its asleep plus its awake time.
 *
 * Only nights with that fingerprint are touched: from Apple Health, no
 * stage segments, and a bedtime between 10:00 and 12:59 (a 12-hour
 * evening or past-midnight time read as morning) or the "12:00" wake. A
 * correct 24-hour night never has either. A re-export from Health Auto
 * Export then replaces the derived times with the exact ones.
 */

import type { SleepNight } from "@/lib/physique/types";

function toMin(hhmm: string | undefined): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function toClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The repaired night, or null when it needs no repair. */
export function repairTwelveHourNight(n: SleepNight): SleepNight | null {
  if (n.source !== "healthkit" || (n.segments?.length ?? 0) > 0) return null;
  const bed = toMin(n.bedtime);
  const misreadBed = bed != null && bed >= 10 * 60 && bed < 13 * 60;
  const misreadWake = n.wakeTime === "12:00";
  if (!misreadBed && !misreadWake) return null;
  const period = n.asleepMin + Math.max(0, n.stages?.awakeMin ?? 0);
  // 10:xx and 11:xx were PM; 12:xx was just after midnight.
  const fixedBed = bed == null ? null : misreadBed ? (bed >= 12 * 60 ? bed - 12 * 60 : bed + 12 * 60) : bed;
  const wake = misreadWake ? null : toMin(n.wakeTime);
  const out: SleepNight = { ...n };
  if (fixedBed != null) out.bedtime = toClock(fixedBed);
  if (misreadWake) {
    if (fixedBed != null) out.wakeTime = toClock(fixedBed + period);
    else delete out.wakeTime;
  } else if (fixedBed == null && wake != null) {
    out.bedtime = toClock(wake - period);
  }
  return out;
}
