import { describe, expect, it } from 'vitest';
import { matchesDomain, parseHost, registrableDomain, usageDomainKey } from './domain';

/**
 * Domain normalization + matching (plan M1).
 * Edge cases called out in the plan: IDN, localhost, chrome://, about:blob,
 * extension pages, ports, IPs, hyphen boundaries.
 */
describe('parseHost', () => {
  it('accepts plain hosts and lowercases them', () => {
    expect(parseHost('YOUTUBE.com')).toBe('youtube.com');
    expect(parseHost('  YouTube.com ')).toBe('youtube.com');
  });

  it('strips a single leading www. label', () => {
    expect(parseHost('www.youtube.com')).toBe('youtube.com');
    expect(parseHost('www.www.youtube.com')).toBe('www.youtube.com'); // trick
    expect(parseHost('mywww.example.com')).toBe('mywww.example.com');
  });

  it('parses full URLs and ignores port/color/path/userinfo', () => {
    expect(parseHost('https://www.YouTube.com/watch?id=9')).toBe('youtube.com');
    expect(parseHost('http://m.youtube.com:8080')).toBe('m.youtube.com');
    expect(parseHost('https://user:pw@Music.Youtube.com/')).toBe('music.youtube.com');
  });

  it('normalizes internationalized domains to pure-ASCII punycode', () => {
    // Don't hardcode the punycode table — assert the properties that matter:
    // a normalized key exists, is ASCII-only, carries an xn-- label, and the
    // same URL with its punycoded spelling normalizes to an identical key.
    const idn = parseHost('https://m.üüü.example.com');
    expect(idn).not.toBeNull();
    expect(idn).toMatch(/^m\.xn--[a-z0-9-]+\.example\.com$/);
    expect(idn).not.toMatch(/[^\x20-\x7E]/); // no non-ASCII leaks into storage keys
    const ascii = parseHost(`https://${idn}`);
    expect(ascii).toBe(idn);
  });

  it('strips the trailing FQDN dot', () => {
    expect(parseHost('example.com.')).toBe('example.com');
  });

  it('leaves IPv4 literals intact (no www to strip)', () => {
    expect(parseHost('http://192.168.1.1:3000/')).toBe('192.168.1.1');
  });

  it('rejects non-web schemes so internal pages never become domains', () => {
    expect(parseHost('chrome://extensions')).toBeNull();
    expect(parseHost('about:blank')).toBeNull();
    expect(parseHost('file:///C:/Windows')).toBeNull();
    expect(parseHost('edge://settings')).toBeNull();
    expect(parseHost('chrome-extension://abcdefghijklmnop/index.html')).toBeNull();
    expect(parseHost('devtools://devtools/bundled')).toBeNull();
  });

  it('rejects junk', () => {
    expect(parseHost('')).toBeNull();
    expect(parseHost('   ')).toBeNull();
    expect(parseHost('not a domain')).toBeNull();
    expect(parseHost('bad host')).toBeNull();
    expect(parseHost(':')).toBeNull();
  });
});

describe('registrableDomain', () => {
  it('reduces subdomains to eTLD+1', () => {
    expect(registrableDomain('m.youtube.com')).toBe('youtube.com');
    expect(registrableDomain('www.youtube.com')).toBe('youtube.com');
    expect(registrableDomain('youtube.com')).toBe('youtube.com');
  });

  it('handles two-level TLDs (three labels)', () => {
    expect(registrableDomain('bbc.co.uk')).toBe('bbc.co.uk');
    expect(registrableDomain('memory.bbc.co.uk')).toBe('bbc.co.uk');
    expect(registrableDomain('foo.com.br')).toBe('foo.com.br');
  });

  it('returns null for non-registrable hosts', () => {
    expect(registrableDomain('localhost')).toBeNull(); // single label
    expect(registrableDomain('192.168.1.1')).toBeNull(); // IP
    expect(registrableDomain('[::1]')).toBeNull(); // IPv6
    expect(registrableDomain('chrome://ext')).toBeNull();
  });
});

describe('usageDomainKey', () => {
  it('uses the registrable domain for ordinary sites', () => {
    expect(usageDomainKey('https://m.youtube.com/watch?v=1')).toBe('youtube.com');
  });

  it('falls back to the bare host for localhost/IP/intranet (still tracked)', () => {
    expect(usageDomainKey('http://localhost:5173/edit')).toBe('localhost');
    expect(usageDomainKey('http://192.168.1.24/admin')).toBe('192.168.1.24');
  });

  it('returns null for non-trackable pseudo-URLs', () => {
    expect(usageDomainKey('chrome://newtab')).toBeNull();
    expect(usageDomainKey('about:blank')).toBeNull();
    expect(usageDomainKey('chrome-extension://abcd/popup.html')).toBeNull();
  });
});

describe('matchesDomain', () => {
  it('matches the exact rule domain', () => {
    expect(matchesDomain('youtube.com', 'youtube.com')).toBe(true);
  });

  it('matches subdomains in both input forms (FR-1.1)', () => {
    expect(matchesDomain('youtube.com', 'm.youtube.com')).toBe(true);
    expect(matchesDomain('youtube.com', 'music.youtube.com')).toBe(true);
    expect(matchesDomain('youtube.com', 'https://videophilia.youtube.com/')).toBe(true);
    expect(matchesDomain('https://youtube.com', 'WWW.y2k.youtube.com')).toBe(true);
  });

  it('never matches against hyphen look-alikes', () => {
    expect(matchesDomain('youtube.com', 'notyoutube.com')).toBe(false);
    expect(matchesDomain('youtube.com', 'youtube.com.evil.io')).toBe(false); // not OUR subdomain
    expect(matchesDomain('youtube.com', 'evil-youtube.com')).toBe(false);
  });

  it('requires the whole label boundary', () => {
    expect(matchesDomain('myapp.com', 'app.com')).toBe(false);
    expect(matchesDomain('app.com', 'xapp.com')).toBe(false);
  });

  it('matches IPs and single-label rules exactly only', () => {
    expect(matchesDomain('192.168.1.1', '192.168.1.1')).toBe(true);
    expect(matchesDomain('192.168.1.1', '2.192.168.1.1')).toBe(false);
    expect(matchesDomain('192.168.1.1', '192.168.111.1')).toBe(false);
    expect(matchesDomain('localhost', 'localhost')).toBe(true);
    expect(matchesDomain('localhost', 'test.localhost')).toBe(false);
  });

  it('is symmetric on case/www noise', () => {
    expect(matchesDomain('WWW.YouTube.com.', 'M.YOUTUBE.COM')).toBe(true);
  });
});
