/**
 * Domain normalization and matching helpers (plan M1, PRD §7.5, FR-1.1).
 *
 * The tracker records and matches hosts per **registrable domain**:
 * the rule `youtube.com` must cover `www.youtube.com`, `m.youtube.com` and
 * `music.youtube.com`, but never `notyoutube.com`.
 *
 * Pure string/URL work only — no extension APIs, so it shares cleanly with
 * Phase 2 and unit-tests instantly in Node.
 */

/**
 * Public-suffix-style two-level suffixes that need three labels for the
 * registrable domain. Deliberately small: it covers common consumer sites the
 * plan targets (social, video, games). A full public-suffix list is Phase 3+.
 */
const MULTI_LEVEL_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'gov.uk',
  'ac.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'or.jp',
  'ne.jp',
  'com.br',
  'com.mx',
  'com.ar',
  'co.nz',
  'co.za',
  'com.sg',
  'com.tr',
  'com.cn',
  'com.tw',
  'com.hk',
  'co.kr',
  'co.in',
]);

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export function isIpv4(host: string): boolean {
  if (!IPV4_RE.test(host)) return false;
  return host.split('.').every((part) => Number(part) <= 255);
}

/** IPs (and single-label hosts like `localhost`) can never own subdomains. */
function hasSubdomains(host: string): boolean {
  return host.includes('.') && !isIpv4(host);
}

/**
 * Parse any URL-ish input down to a **bare hostname**:
 *  - lowercased, IDN → punycode (WHATWG URL semantics),
 *  - no port, no userinfo, no path,
 *  - trailing dot stripped, one leading `www.` label stripped.
 *
 * Returns `null` (never a bogus domain) when the input:
 *  - carries a non-http(s) scheme (`chrome://`, `about:`, `file://`, `devtools://`, …),
 *  - cannot be parsed as a URL or as a bare host,
 *  - contains whitespace.
 */
export function parseHost(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  let url: URL;
  try {
    url = trimmed.includes('://') ? new URL(trimmed) : new URL(`http://${trimmed}`);
  } catch {
    return null;
  }

  // `chrome://extensions` parses with a host under WHATWG rules — reject any
  // non-web scheme explicitly so internal pages can never become "domains".
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  // `hostname` already excludes port/userinfo and is lowercased + punycoded.
  let host = url.hostname.replace(/\.$/, ''); // trailing FQDN dot
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1); // IPv6
  if (!host) return null;

  return stripWww(host);
}

/** Remove a single leading `www.` label (www.www.youtube.com keeps one trick). */
function stripWww(host: string): string {
  return host.replace(/^www\./i, '');
}

/**
 * The registrable domain (eTLD+1) of a host — the key that rules and
 * per-day usage are stored under:
 *  - `m.youtube.com` → `youtube.com`, `bbc.co.uk` → `bbc.co.uk`,
 *  - `localhost`, single labels, and IP addresses → `null`.
 */
export function registrableDomain(input: string): string | null {
  const host = parseHost(input);
  if (!host || !hasSubdomains(host)) return null;

  const labels = host.split('.');
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_LEVEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/**
 * The key under which a URL's time is stored in `UsageDay.byDomain`:
 * the registrable domain, or — when none exists (`localhost`, IPs, intranet
 * single-labels) — the bare host so those origins are still tracked honestly.
 */
export function usageDomainKey(input: string): string | null {
  const host = parseHost(input);
  if (!host) return null;
  return registrableDomain(host) ?? host;
}

/**
 * Rule matching (FR-1.1): a rule covering `ruleDomain` matches the exact host
 * and every subdomain of it. IPs and single-label rules match only exactly,
 * and hyphen boundaries are respected (`snotdomain.com` never matches
 * `notdomain.com`).
 */
export function matchesDomain(ruleDomain: string, candidate: string): boolean {
  const rule = parseHost(ruleDomain);
  const host = parseHost(candidate);
  if (!rule || !host) return false;
  if (rule === host) return true;
  if (!hasSubdomains(rule)) return false; // IP or single-label rule: exact only
  return host.endsWith(`.${rule}`);
}
