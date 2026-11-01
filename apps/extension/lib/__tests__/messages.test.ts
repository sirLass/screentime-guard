import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPrivilegedSender, runtimeFacts, sendToBackground } from '../messages';

/**
 * Sender authorization (plan M1): only our own extension pages may send
 * privileged messages. Content scripts run over web-page URLs; other
 * extensions carry a foreign sender id.
 */
const ID = 'abcdefghij';

function pageOrigin(): string {
  return `chrome-extension://${ID}`;
}

/** Minimal fake of the `browser` global (WXT auto-import) for runtime tests. */
const fakeBrowser = {
  runtime: {
    id: ID,
    getURL: (path: string) => `chrome-extension://${ID}/${path}`,
    sendMessage: vi.fn(),
  },
};

describe('isPrivilegedSender', () => {
  it('accepts our own extension pages by origin', () => {
    expect(isPrivilegedSender({ id: ID, origin: pageOrigin() }, ID, pageOrigin())).toBe(true);
  });

  it('accepts our own pages by URL when the runtime exposes no origin', () => {
    expect(
      isPrivilegedSender({ id: ID, url: `${pageOrigin()}/popup.html?tab=1` }, ID, pageOrigin()),
    ).toBe(true);
  });

  it('rejects content scripts: same id, but a web-page URL — the discriminator', () => {
    expect(
      isPrivilegedSender({ id: ID, origin: 'https://evil.example.com' }, ID, pageOrigin()),
    ).toBe(false);
    expect(
      isPrivilegedSender({ id: ID, url: 'https://evil.example.com/index.html' }, ID, pageOrigin()),
    ).toBe(false);
  });

  it('rejects other extensions even when the URL looks extension-ish', () => {
    expect(
      isPrivilegedSender({ id: 'other-extension-id', origin: pageOrigin() }, ID, pageOrigin()),
    ).toBe(false);
  });

  it('rejects inputs with neither a matching origin nor a usable URL', () => {
    expect(isPrivilegedSender({ id: ID }, ID, pageOrigin())).toBe(false);
    expect(isPrivilegedSender({}, ID, pageOrigin())).toBe(false);
  });

  it('is not fooled by look-alike paths (URL prefix is position-sensitive)', () => {
    expect(
      isPrivilegedSender(
        { id: ID, url: `https://evil.example.com/phish?url=${pageOrigin()}/admin` },
        ID,
        pageOrigin(),
      ),
    ).toBe(false);
  });
});

describe('transformed runtime helpers (stubbed browser)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sendToBackground forwards the request and returns the typed response', async () => {
    vi.stubGlobal('browser', fakeBrowser);
    fakeBrowser.runtime.sendMessage.mockResolvedValue({
      type: 'STATUS',
      schemaVersion: 2,
      session: null,
    });
    const resp = await sendToBackground({ type: 'GET_STATUS' });
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_STATUS' });
    expect(resp).toEqual({ type: 'STATUS', schemaVersion: 2, session: null });
  });

  it('sendToBackground resolves null when the worker answers with nothing yet', async () => {
    vi.stubGlobal('browser', fakeBrowser);
    fakeBrowser.runtime.sendMessage.mockResolvedValue(null);
    await expect(sendToBackground({ type: 'GET_STATUS' })).resolves.toBeNull();
  });

  it('sendToBackground degrades to an ERROR response when the runtime rejects', async () => {
    vi.stubGlobal('browser', fakeBrowser);
    fakeBrowser.runtime.sendMessage.mockRejectedValue(new Error('worker not awake'));
    const resp = await sendToBackground({ type: 'GET_STATUS' });
    expect(resp?.type).toBe('ERROR');
    expect(resp?.type === 'ERROR' && resp.error).toContain('worker not awake');
  });

  it('runtimeFacts derives id and page origin without URL.origin quirks', () => {
    vi.stubGlobal('browser', fakeBrowser);
    expect(runtimeFacts()).toEqual({
      extensionId: ID,
      extensionOrigin: pageOrigin(),
    });
  });
});
