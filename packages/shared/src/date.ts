/**
 * Date helpers in **local time** (plan M1, FR-1.2).
 *
 * All the tracker's day boundaries (usage buckets, limits, resets) follow the
 * child's local clock — a limit "per day" means per local day. Epoch ms is the
 * only thing persisted; day keys are derived.
 */

import type { DayOfWeek } from './types';

/** A civil local date in ISO form: `YYYY-MM-DD`. */
export type DateKey = string;

/** Zero-padded two digits. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `2026-10-31` from a local date. */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local date key for an epoch-ms timestamp (defaults to now). */
export function localDateKey(epochMs: number = Date.now()): DateKey {
  return toDateKey(new Date(epochMs));
}

/** Today's key, local clock. */
export function today(epochMs: number = Date.now()): DateKey {
  return localDateKey(epochMs);
}

/** Epoch ms at local midnight (now, if still today). */
export function localMidnightMs(epochMs: number = Date.now()): number {
  const d = new Date(epochMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Epoch ms of the *next* local midnight — the daily-reset alarm's due time. */
export function nextLocalMidnightMs(epochMs: number = Date.now()): number {
  return localMidnightMs(epochMs) + 86_400_000;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict parse of `YYYY-MM-DD` into UTC-anchored parts (no timezone drift). */
function partsOf(key: DateKey): [number, number, number] | null {
  if (!DATE_KEY_RE.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return [y, m, d];
}

/** Is `key` a plausible `YYYY-MM-DD` date? */
export function isDateKey(key: string): key is DateKey {
  return partsOf(key) !== null;
}

/** Civil days from `a` to `b` (positive if `b` is later). */
export function daysBetween(a: DateKey, b: DateKey): number {
  const pa = partsOf(a);
  const pb = partsOf(b);
  if (!pa || !pb) return 0;
  const [ya, ma, da] = pa;
  const [yb, mb, db] = pb;
  const ea = Date.UTC(ya, ma - 1, da);
  const eb = Date.UTC(yb, mb - 1, db);
  return Math.round((eb - ea) / 86_400_000);
}

/** True once accounting has moved into a new local day (day rollover, FR-1.2). */
export function hasDayRolled(prevKey: DateKey, currentKey: DateKey): boolean {
  return prevKey !== currentKey;
}

/**
 * Day-of-week as `getDay()` semantics (0 = Sunday … 6 = Saturday) for a civil
 * date — computed in UTC because weekday does not depend on the timezone of
 * the calendar date, only on the date itself.
 */
export function dayOfWeek(key: DateKey): DayOfWeek {
  const p = partsOf(key);
  if (!p) return 0;
  const [y, m, d] = p;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as DayOfWeek;
}

/** `"15:00"` → 900 minutes since local midnight; lenient optional seconds. */
export function parseClockTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Is `minutesSinceMidnight` inside any of the rule's time windows (FR-2.3)?
 * Windows may cross midnight — `22:00`–`06:00` covers both evenings.
 */
export function isWithinWindows(
  windows: readonly { start: string; end: string }[] | undefined,
  minutesSinceMidnight: number,
): boolean {
  if (!windows || windows.length === 0) return true;
  return windows.some((w) => {
    const start = parseClockTime(w.start);
    const end = parseClockTime(w.end);
    if (start === null || end === null) return false;
    return start <= end
      ? minutesSinceMidnight >= start && minutesSinceMidnight < end
      : minutesSinceMidnight >= start || minutesSinceMidnight < end; // crosses midnight
  });
}
