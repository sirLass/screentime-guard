/**
 * Messaging (plan milestone M1).
 *
 * A typed request/response protocol between extension pages (popup, options,
 * blocked page) and the background service worker. Protocol types are only
 * declared here — actual handlers land with M2–M4 work (tracker queries,
 * rule writes, PIN verification, time grants).
 *
 * Privilege model (plan §M1): only *our own* extension pages may send
 * privileged messages. Content scripts on external sites report the same
 * extension id but a web-page `url`/`origin`, which is exactly what
 * `isPrivilegedSender` discriminates on.
 */
import type { Rule, Session, TimeExtension } from '@screentime-guard/shared';

/** UI → background requests. */
export type BackgroundRequest =
  | { type: 'GET_STATUS' }
  | { type: 'ADD_RULE'; rule: Rule }
  | { type: 'REMOVE_RULE'; ruleId: string }
  | { type: 'VERIFY_PIN'; pin: string }
  | { type: 'GRANT_EXTENSION'; ruleId: string; extraMin: number };

/** Background → UI responses, one variant per request family. */
export type BackgroundResponse =
  | { type: 'STATUS'; schemaVersion: number; session: Session | null }
  | { type: 'RULE_SAVED'; rule: Rule }
  | { type: 'OK' }
  | { type: 'PIN_RESULT'; success: boolean; remainingAttempts?: number; lockedUntil?: number }
  | { type: 'TIME_GRANTED'; extension: TimeExtension }
  | { type: 'ERROR'; error: string };

/**
 * Structural subset of `chrome.runtime.MessageSender` used for authorization
 * — nominal enough to unit test, loose enough to accept both the WXT `browser`
 * and mock senders in tests.
 */
export type MessageSender = {
  id?: string;
  url?: string;
  origin?: string;
};

/**
 * A sender is privileged iff the message came from one of our own pages.
 * Content scripts run on `https://evil.example/…` URLs; other extensions send
 * with a different `sender.id` — both must fail.
 *
 * Pure by design: takes the two runtime facts (extension id + page origin)
 * as arguments instead of reading `browser` globals, so tests need no mocks.
 *
 * @param extensionId  `browser.runtime.id`
 * @param extensionOrigin  e.g. `new URL(browser.runtime.getURL('')).origin`
 */
export function isPrivilegedSender(
  sender: MessageSender,
  extensionId: string,
  extensionOrigin: string,
): boolean {
  if (sender.id !== extensionId) return false;
  if (sender.origin) return sender.origin === extensionOrigin;
  // Older Chrome without `origin`: fall back to the URL prefix check
  // (`chrome-extension://<id>/…`). A URL-only check would also pass for
  // look-alike paths like `https://evil.example/chrome-extension://<id>/`,
  // which is exactly why origin is preferred when available.
  const url = sender.url;
  if (!url) return false;
  return url.startsWith(`${extensionOrigin}/`);
}

/**
 * Runtime facts for `isPrivilegedSender` — never used by unit tests.
 * The origin is derived from `getURL('')` with the trailing slash stripped:
 * `new URL(...).origin` returns `"null"` for non-special schemes in some
 * runtimes (Node), which would silently authorize nobody.
 */
export function runtimeFacts(): { extensionId: string; extensionOrigin: string } {
  const extensionId = browser.runtime.id;
  const extensionOrigin = browser.runtime.getURL('').replace(/\/+$/, '');
  return { extensionId, extensionOrigin };
}

/**
 * Send a request to the background worker and settle with `null` when the
 * worker is not listening yet (MV3 wakes it asynchronously; callers treat
 * `null` as "ask again shortly").
 */
export async function sendToBackground(
  request: BackgroundRequest,
): Promise<BackgroundResponse | null> {
  try {
    return (await browser.runtime.sendMessage(request)) as BackgroundResponse | null;
  } catch (error) {
    console.warn('[ScreenTime Guard] message failed', request.type, error);
    return { type: 'ERROR', error: String(error) };
  }
}
