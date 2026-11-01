import { describe, expect, it } from 'vitest';
import {
  MAX_DAILY_LIMIT_MIN,
  isValidRuleDomain,
  validateRule,
  validateTimeExtension,
} from './validate';
import type { Rule } from './types';

const baseRule: Rule = {
  id: 'r1',
  domain: 'youtube.com',
  dailyLimitMin: 60,
  updatedAt: 0,
};

describe('isValidRuleDomain', () => {
  it('accepts ordinary registrable domains', () => {
    expect(isValidRuleDomain('youtube.com')).toBe(true);
    expect(isValidRuleDomain('bbc.co.uk')).toBe(true);
    expect(isValidRuleDomain('sub.sub.example.io')).toBe(true);
  });

  it('accepts scheme-free input and valid IDN punycode', () => {
    expect(isValidRuleDomain('https://youtube.com')).toBe(true);
    expect(isValidRuleDomain('xn--tda.com')).toBe(true); // üüü.com as stored by parseHost
    // Malformed punycode is rejected by the URL layer's strict IDNA validation.
    expect(isValidRuleDomain('xn--x-ozav.com')).toBe(false);
  });

  it('accepts IPv4 for network device blocking', () => {
    expect(isValidRuleDomain('192.168.1.1')).toBe(true);
    expect(isValidRuleDomain('8.8.8.8')).toBe(true);
  });

  it('rejects single-label hosts like localhost', () => {
    expect(isValidRuleDomain('localhost')).toBe(false);
  });

  it('rejects internal pseudo-hosts and junk', () => {
    expect(isValidRuleDomain('chrome://extensions')).toBe(false);
    expect(isValidRuleDomain('about:blank')).toBe(false);
    expect(isValidRuleDomain('chrome-extension://abcd/p.html')).toBe(false);
    expect(isValidRuleDomain('')).toBe(false);
    expect(isValidRuleDomain('-bad.com')).toBe(false); // label may not start with '-'
    expect(isValidRuleDomain('bad-.com')).toBe(false);
    expect(isValidRuleDomain('a..b.com')).toBe(false);
    expect(isValidRuleDomain('c half.com')).toBe(false);
  });
});

describe('validateRule', () => {
  it('passes a normal rule', () => {
    expect(validateRule(baseRule).ok).toBe(true);
  });

  it('accepts track-only (null) and always-blocked (0) limits', () => {
    expect(validateRule({ ...baseRule, dailyLimitMin: null }).ok).toBe(true);
    expect(validateRule({ ...baseRule, dailyLimitMin: 0 }).ok).toBe(true);
  });

  it('rejects out-of-range or fractional limits', () => {
    expect(validateRule({ ...baseRule, dailyLimitMin: -1 }).ok).toBe(false);
    expect(validateRule({ ...baseRule, dailyLimitMin: MAX_DAILY_LIMIT_MIN + 1 }).ok).toBe(false);
    expect(validateRule({ ...baseRule, dailyLimitMin: 22.5 }).ok).toBe(false);
    expect(validateRule({ ...baseRule, dailyLimitMin: 1440 }).ok).toBe(true); // full-day boundary
  });

  it('checks per-weekday override values and keys', () => {
    expect(validateRule({ ...baseRule, dayOverrides: { 0: 30, 6: null } }).ok).toBe(true);
    const bad = validateRule({
      ...baseRule,
      dayOverrides: { 0: 5000, 9: 10 } as never,
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('windows must parse; zero-length is rejected; cross-midnight is allowed', () => {
    expect(
      validateRule({ ...baseRule, allowedWindows: [{ start: '15:00', end: '19:00' }] }).ok,
    ).toBe(true);
    expect(
      validateRule({ ...baseRule, allowedWindows: [{ start: '22:00', end: '06:00' }] }).ok,
    ).toBe(true); // crosses midnight
    const zero = validateRule({ ...baseRule, allowedWindows: [{ start: '15:00', end: '15:00' }] });
    expect(zero.ok).toBe(false);
    expect(zero.errors.some((e) => e.includes('zero-length'))).toBe(true);
    expect(
      validateRule({ ...baseRule, allowedWindows: [{ start: '25:00', end: '06:00' }] }).ok,
    ).toBe(false);
    expect(
      validateRule({ ...baseRule, allowedWindows: [{ start: 'noon', end: '06:00' }] }).ok,
    ).toBe(false);
  });
});

describe('validateTimeExtension', () => {
  it('accepts a sane grant', () => {
    expect(validateTimeExtension({ ruleId: 'r1', date: '2026-11-01', extraMin: 15 }).ok).toBe(true);
  });

  it('needs positive minutes and a valid date key', () => {
    expect(validateTimeExtension({ ruleId: 'r1', date: '2026-11-01', extraMin: 0 }).ok).toBe(false);
    expect(validateTimeExtension({ ruleId: 'r1', date: '2026-11-01', extraMin: 7.5 }).ok).toBe(
      false,
    );
    expect(validateTimeExtension({ ruleId: 'r1', date: 'November 1', extraMin: 15 }).ok).toBe(
      false,
    );
    expect(validateTimeExtension({ ruleId: '', date: '2026-11-01', extraMin: 15 }).ok).toBe(false);
  });
});
