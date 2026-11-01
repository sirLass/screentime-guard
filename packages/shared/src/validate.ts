/**
 * Hand-rolled validation for settings, rules and grants (plan M1, FR-2.x).
 *
 * Deliberately zero-dependency (no zod): the package must stay dependency-free
 * for both Web Store size budgets and unit-testability. Errors are returned as
 * human-readable strings for direct display in the options UI (M4).
 */

import { isIpv4, parseHost } from './domain';
import { isDateKey, parseClockTime } from './date';
import type { Rule } from './types';

/** Maximum daily minutes per rule — a full day (FR-4.x validation). */
export const MAX_DAILY_LIMIT_MIN = 1440;

export type ValidationResult = {
  ok: boolean;
  /** Human-readable, one per problem; empty when `ok`. */
  errors: string[];
};

/** At least one error → invalid. */
function collect(errors: string[]): ValidationResult {
  return errors.length === 0 ? { ok: true, errors } : { ok: false, errors };
}

/**
 * A rule domain must be a valid registrable domain (`youtube.com`), an IDN in
 * punycode form, or an IPv4 address (`192.168.1.10`, octets ≤ 255). Single-label
 * hosts (`localhost`) are trackable but cannot be limited — limits only make
 * sense per-service.
 */
export function isValidRuleDomain(domain: string): boolean {
  const host = parseHost(domain);
  if (!host) return false;
  if (isIpv4(host)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return false; // 4 numeric groups but bad IPv4 → reject outright
  const labels = host.split('.');
  if (labels.length < 2) return false;
  if (host.length > 253) return false;
  const labelRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!labels.every((l) => labelRe.test(l))) return false;
  const tld = labels[labels.length - 1];
  if (tld === undefined) return false;
  // Traditional alpha TLDs and IDN punycode TLDs both qualify.
  return /^[a-z]{2,63}$/.test(tld) || /^xn--[a-z0-9-]{1,59}$/.test(tld);
}

function isDailyLimitOk(v: unknown): v is number | null {
  return (
    v === null ||
    (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_DAILY_LIMIT_MIN)
  );
}

/**
 * Validate a full rule draft before it is persisted. Checks (plan M1):
 *  - domain format,
 *  - `dailyLimitMin`: `null` (track-only) or an integer 0–1440,
 *  - per-weekday overrides: same range as above,
 *  - allowed windows: valid `HH:MM` pairs; a window that starts at its own end
 *    is meaningless (zero length) and rejected.
 */
export function validateRule(rule: Rule): ValidationResult {
  const errors: string[] = [];

  if (!isValidRuleDomain(rule.domain)) {
    errors.push(`Invalid domain: "${rule.domain}"`);
  }

  if (!isDailyLimitOk(rule.dailyLimitMin)) {
    errors.push(
      `dailyLimitMin must be null or an integer 0–${MAX_DAILY_LIMIT_MIN}, got ${rule.dailyLimitMin}`,
    );
  }

  if (rule.dayOverrides) {
    for (const [day, value] of Object.entries(rule.dayOverrides)) {
      const d = Number(day);
      if (!(d >= 0 && d <= 6)) errors.push(`dayOverrides key must be 0–6, got ${day}`);
      if (!isDailyLimitOk(value)) {
        errors.push(
          `dayOverrides[${day}] must be null or an integer 0–${MAX_DAILY_LIMIT_MIN}, got ${value}`,
        );
      }
    }
  }

  if (rule.allowedWindows) {
    for (const w of rule.allowedWindows) {
      const start = parseClockTime(w.start);
      const end = parseClockTime(w.end);
      if (start === null)
        errors.push(`Window start must be "HH:MM", got ${JSON.stringify(w.start)}`);
      if (end === null) errors.push(`Window end must be "HH:MM", got ${JSON.stringify(w.end)}`);
      if (start !== null && end !== null && start === end) {
        errors.push(`Window ${w.start}–${w.end} is zero-length`);
      }
    }
  }

  if (!Number.isFinite(rule.updatedAt) || rule.updatedAt < 0) {
    errors.push(`updatedAt must be a finite, non-negative timestamp, got ${rule.updatedAt}`);
  }

  return collect(errors);
}

/**
 * Validate a granted time extension (FR-2.5): positive whole minutes, no more
 * than a day's worth, tied to a rule and a local date key.
 */
export function validateTimeExtension(ext: {
  ruleId: string;
  date: string;
  extraMin: number;
}): ValidationResult {
  const errors: string[] = [];
  if (!ext.ruleId) errors.push('ruleId is required');
  if (!isDateKey(ext.date))
    errors.push(`date must be "YYYY-MM-DD", got ${JSON.stringify(ext.date)}`);
  if (!Number.isInteger(ext.extraMin) || ext.extraMin <= 0 || ext.extraMin > MAX_DAILY_LIMIT_MIN) {
    errors.push(
      `extraMin must be a positive integer 1–${MAX_DAILY_LIMIT_MIN}, got ${ext.extraMin}`,
    );
  }
  return collect(errors);
}
