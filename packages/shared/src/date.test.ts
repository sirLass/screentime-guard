import { describe, expect, it } from 'vitest';
import {
  dayOfWeek,
  daysBetween,
  hasDayRolled,
  isDateKey,
  isWithinWindows,
  localDateKey,
  localMidnightMs,
  nextLocalMidnightMs,
  parseClockTime,
  toDateKey,
  today,
} from './date';

/** Deterministic times: all in UTC tz fallback times, checked via local getters. */
function makeLocalDate(y: number, mZeroBased: number, d: number, h = 0, min = 0, s = 0): Date {
  return new Date(y, mZeroBased, d, h, min, s);
}

describe('date keys & today', () => {
  it('formats local dates as YYYY-MM-DD with zero-padding', () => {
    // Local rendering, not UTC — assert against the same local getters.
    const d = makeLocalDate(2026, 0, 1, 5, 9);
    expect(toDateKey(d)).toBe('2026-01-01');
    const late = makeLocalDate(2026, 9, 21, 23, 59, 59);
    expect(toDateKey(late)).toBe('2026-10-21');
  });

  it('localDateKey agrees with toDateKey on epoch input', () => {
    const ms = makeLocalDate(2026, 10, 1).getTime();
    expect(localDateKey(ms)).toBe('2026-11-01');
  });

  it('today() accepts an explicit now (tested clock)', () => {
    const nearMidnight = makeLocalDate(2026, 10, 1, 23, 59);
    expect(today(nearMidnight.getTime())).toBe('2026-11-01');
  });
});

describe('day rollover detection (FR-1.2)', () => {
  it('detects a changed day', () => {
    expect(hasDayRolled('2026-10-21', '2026-10-22')).toBe(true);
  });

  it('same key is not a rollover', () => {
    expect(hasDayRolled('2026-10-21', '2026-10-21')).toBe(false);
  });

  it('a 23h59m59s gap can still be same-day; seconds later is a new day', () => {
    const eve = makeLocalDate(2026, 10, 1, 23, 59, 59).getTime();
    const night = makeLocalDate(2026, 10, 2, 0, 0, 0).getTime();
    expect(hasDayRolled(localDateKey(eve), localDateKey(night))).toBe(true);
  });
});

describe('midnight helpers', () => {
  it('localMidnightMs returns the epoch of local 00:00 of the same day', () => {
    const anyTime = makeLocalDate(2026, 10, 1, 17, 3).getTime();
    const mid = localMidnightMs(anyTime);
    expect(toDateKey(new Date(mid))).toBe('2026-11-01');
    expect(mid).toBeLessThanOrEqual(anyTime);
    expect(anyTime - mid).toBeLessThan(86_400_000);
  });

  it('nextLocalMidnightMs lands on tomorrow local 00:00', () => {
    const late = makeLocalDate(2026, 10, 1, 23, 59).getTime();
    const next = nextLocalMidnightMs(late);
    expect(toDateKey(new Date(next))).toBe('2026-11-02');
    expect(new Date(next).getHours()).toBe(0);
    expect(new Date(next).getMinutes()).toBe(0);
  });
});

describe('day-of-week and civil math', () => {
  it('computes getDay-style weekdays for known dates', () => {
    // 2026-11-01 is a Sunday (getUTCDay on the civil date must not drift).
    expect(dayOfWeek('2026-11-01')).toBe(0);
    expect(dayOfWeek('2026-11-06')).toBe(5); // Friday
    expect(dayOfWeek('2026-10-21')).toBe(3); // Wednesday
  });

  it('counts days across month/year boundaries', () => {
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-11-01', '2026-10-01')).toBe(-31);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1); // non-leap year
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2); // leap year: Feb 29 in between
  });

  it('validates keys strictly', () => {
    expect(isDateKey('2026-11-01')).toBe(true);
    expect(isDateKey('2026-1-1')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('_october')).toBe(false);
  });
});

describe('clock time parsing', () => {
  it('parses HH:MM (and tolerates HH:MM:SS)', () => {
    expect(parseClockTime('15:00')).toBe(900);
    expect(parseClockTime('0:00')).toBe(0);
    expect(parseClockTime('23:59')).toBe(1439);
    expect(parseClockTime('23:59:59')).toBe(1439);
  });

  it('rejects out-of-range or malformed times', () => {
    expect(parseClockTime('24:00')).toBeNull();
    expect(parseClockTime('12:60')).toBeNull();
    expect(parseClockTime('noon')).toBeNull();
    expect(parseClockTime('')).toBeNull();
    expect(parseClockTime('-1:00')).toBeNull();
  });
});

describe('allowed time windows (FR-2.3)', () => {
  it('no windows means always allowed', () => {
    expect(isWithinWindows(undefined, 0)).toBe(true);
    expect(isWithinWindows([], 100)).toBe(true);
  });

  it('inside the window counts, boundaries included at start but not end', () => {
    const w = [{ start: '15:00', end: '19:00' }];
    expect(isWithinWindows(w, 900)).toBe(true); // 15:00
    expect(isWithinWindows(w, 1139)).toBe(true); // 18:59
    expect(isWithinWindows(w, 1140)).toBe(false); // 19:00
  });

  it('arrays of windows: inside any single window', () => {
    const w = [
      { start: '07:00', end: '09:00' },
      { start: '15:00', end: '19:00' },
    ];
    expect(isWithinWindows(w, 420)).toBe(true);
    expect(isWithinWindows(w, 540)).toBe(false);
    expect(isWithinWindows(w, 900)).toBe(true);
  });

  it('windows crossing midnight cover both evenings (plan M3)', () => {
    // "15:00"–`06:00` starting evening 22:30 belongs to the window.
    const w = [{ start: '22:00', end: '06:00' }];
    expect(isWithinWindows(w, 660)) // 11:00
      .toBe(false);
    expect(isWithinWindows(w, 1320)) // 22:00
      .toBe(true);
    expect(isWithinWindows(w, 1439)) // 23:59
      .toBe(true);
    expect(isWithinWindows(w, 299)) // 04:59
      .toBe(true);
    expect(isWithinWindows(w, 360)) // 06:00
      .toBe(false);
  });

  it('malformed window definitions simply never match', () => {
    const w = [{ start: '99:99', end: '06:00' }];
    expect(isWithinWindows(w, 500)).toBe(false);
  });
});
