import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_STORE,
  SCHEMA_VERSION,
  ensureSchema,
  getStore,
  migrateStore,
  onStoreChanged,
  resetStore,
  setStore,
  updateStore,
  defaultArea,
  type StorageArea,
  type StoreShape,
} from '../storage';

/**
 * Map-backed in-memory StorageArea with a deliberate async tick inside `get`,
 * so concurrent operations genuinely interleave â€” proving the per-key queue in
 * `updateStore` serializes them (plan M1: "concurrent updates").
 */
class FakeArea implements StorageArea {
  private data = new Map<string, unknown>();

  async get(
    keys?: string | string[] | Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    await new Promise((r) => setTimeout(r, 1));
    if (keys === null || keys === undefined) return Object.fromEntries(this.data);
    const wanted =
      typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const out: Record<string, unknown> = {};
    for (const k of wanted) if (this.data.has(k)) out[k] = this.data.get(k);
    return out;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await new Promise((r) => setTimeout(r, 1));
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
  }

  /** Synchronous peek for assertions (distinct from the interface's `get`). */
  peek(key: string): unknown {
    return this.data.get(key);
  }
}

class FakeAreaSlow extends FakeArea {
  override async get(
    keys?: string | string[] | Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    // Random-ish delay profile to shuffle microtask order between callers.
    await new Promise((r) => setTimeout(r, Math.random() * 4));
    return super.get(keys);
  }
}

/** Capture add/remove of chrome.storage.onChanged, emit manually. */
class FakeChangedSource {
  listeners = new Set<(changes: unknown, areaName: string) => void>();

  storageChangedSource() {
    return {
      addListener: (l: (changes: unknown, areaName: string) => void) => this.listeners.add(l),
      removeListener: (l: (changes: unknown, areaName: string) => void) => this.listeners.delete(l),
    };
  }

  fire(changes: unknown, areaName = 'local'): void {
    for (const l of [...this.listeners]) l(changes, areaName);
  }
}

describe('getStore defaults', () => {
  it('returns fresh defaults on an empty store', async () => {
    const area = new FakeArea();
    await expect(getStore(area, 'settings')).resolves.toEqual(DEFAULT_SETTINGS);
    await expect(getStore(area, 'rules')).resolves.toEqual({});
    await expect(getStore(area, 'extensions')).resolves.toEqual([]);
    await expect(getStore(area, 'usage')).resolves.toEqual({});
    await expect(getStore(area, 'currentSession')).resolves.toBeNull();
    await expect(getStore(area, 'schemaVersion')).resolves.toBe(SCHEMA_VERSION);
  });

  it('falls back to defaults when a stored slice is explicitly null', async () => {
    const area = new FakeArea();
    await area.set({ settings: null });
    await expect(getStore(area, 'settings')).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('fills settings keys added by newer schemas into old stored objects', async () => {
    const area = new FakeArea();
    await setStore(area, 'settings', {
      pinHash: 'h',
      pinSalt: 's',
    } as unknown as StoreShape['settings']);
    await expect(getStore(area, 'settings')).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      pinHash: 'h',
      pinSalt: 's',
    });
  });

  it('round-trips a rules write', async () => {
    const area = new FakeArea();
    const rules: StoreShape['rules'] = {
      r1: { id: 'r1', domain: 'youtube.com', dailyLimitMin: 60, updatedAt: 1 },
    };
    await setStore(area, 'rules', rules);
    await expect(getStore(area, 'rules')).resolves.toEqual(rules);
  });
});

describe('updateStore atomicity (concurrent updates)', () => {
  it('never loses increments across 100 racing mutations', async () => {
    const area = new FakeAreaSlow();
    await setStore(area, 'usage', { '2026-11-01': { date: '2026-11-01', byDomain: {} } });
    const jobs = Array.from({ length: 100 }, () =>
      updateStore(area, 'usage', (usage) => {
        const day = usage['2026-11-01'] ?? { date: '2026-11-01', byDomain: {} };
        const seconds = day.byDomain['youtube.com'] ?? 0;
        return {
          ...usage,
          '2026-11-01': { ...day, byDomain: { ...day.byDomain, 'youtube.com': seconds + 1 } },
        };
      }),
    );
    await Promise.all(jobs);
    const usage = await getStore(area, 'usage');
    expect(usage['2026-11-01']?.byDomain['youtube.com']).toBe(100);
  });

  it('a failed mutation does not poison the queue for later callers', async () => {
    const area = new FakeArea();
    await expect(
      updateStore(area, 'settings', () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const next = await updateStore(area, 'rules', () => ({
      r1: { id: 'r1', domain: 'a.com', dailyLimitMin: 1, updatedAt: 2 },
    }));
    expect(next.r1?.id).toBe('r1');
  });
});

describe('schema migrations', () => {
  it('migrateStore is pure: v1 â†’ v2 fills retentionDays without touching other data', () => {
    // Pre-versioning build's store (no schemaVersion marker) â†’ treated as v0.
    const raw: Record<string, unknown> = {
      settings: {
        pinHash: 'h',
        pinSalt: 's',
        idleThresholdSec: 60,
        warnBeforeMin: 5,
        syncEnabled: false,
      },
      usage: { '2026-10-21': { date: '2026-10-21', byDomain: { 'youtube.com': 5 } } },
    };
    const { store, from, to } = migrateStore(raw);
    expect(from).toBe(0);
    expect(to).toBe(2);
    const settings = store.settings as StoreShape['settings'];
    expect(settings.retentionDays).toBe(90);
    expect(settings.pinHash).toBe('h'); // no wipe
    expect((store.usage as StoreShape['usage'])['2026-10-21']?.byDomain['youtube.com']).toBe(5);
    expect(store.schemaVersion).toBe(2);
    // The raw input is unchanged (purity â€” no in-place mutation of the caller's data).
    expect(raw.schemaVersion).toBeUndefined();
    expect(raw.settings).not.toHaveProperty('retentionDays');
  });

  it('migrateStore leaves data from a newer build untouched (no downgrade)', () => {
    const raw = { schemaVersion: 99, settings: { retentionDays: 7 } };
    const { store, from, to } = migrateStore(raw);
    expect(from).toBe(99);
    expect(to).toBe(99);
    expect(store).toEqual({ schemaVersion: 99, settings: { retentionDays: 7 } });
  });

  it('migrateStore is a no-op for a store already at the current version', () => {
    const raw: Record<string, unknown> = { schemaVersion: 2, currentSession: null };
    const { store, from, to } = migrateStore(raw);
    expect(from).toBe(2);
    expect(to).toBe(2);
    expect(store).toEqual(raw);
  });

  it('ensureSchema repairs corrupt slices without dropping valid data', async () => {
    const area = new FakeArea();
    await area.set({
      schemaVersion: 1,
      settings: 'junk', // wrong type entirely — the v2 migration seeds from a non-object
      rules: 'corrupt' as unknown, // defined but non-object
      extensions: 'nope' as unknown, // defined but not an array
      usage: 42 as unknown, // defined but non-object
      currentSession: { domain: 'a.com', startedAt: 1, lastTickAt: 1 }, // valid, must survive
    } as unknown as Record<string, unknown>);
    const store = await ensureSchema(area);
    expect(store.settings).toEqual({ ...DEFAULT_SETTINGS });
    expect(store.rules).toEqual({});
    expect(store.extensions).toEqual([]);
    expect(store.usage).toEqual({});
    expect(store.currentSession).toEqual({ domain: 'a.com', startedAt: 1, lastTickAt: 1 });
    expect(store.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('ensureSchema initializes a fresh install with the full default store', async () => {
    const area = new FakeArea();
    const store = await ensureSchema(area);
    expect(store.schemaVersion).toBe(SCHEMA_VERSION);
    expect(area.peek('schemaVersion')).toBe(SCHEMA_VERSION);
    expect(area.peek('settings')).toEqual(DEFAULT_SETTINGS);
    expect(area.peek('usage')).toEqual({});
  });

  it('ensureSchema migrates legacy data in place and marks the version', async () => {
    const area = new FakeArea();
    await area.set({
      settings: {
        pinHash: 'h',
        pinSalt: 's',
        idleThresholdSec: 60,
        warnBeforeMin: 5,
        syncEnabled: false,
      },
      rules: { r1: { id: 'r1', domain: 'a.com', dailyLimitMin: null, updatedAt: 3 } },
    });
    const store = await ensureSchema(area);
    expect(store.schemaVersion).toBe(SCHEMA_VERSION);
    expect(store.settings.retentionDays).toBe(90);
    expect(store.rules.r1?.dailyLimitMin).toBeNull();
    // Persisted, not just returned:
    expect(area.peek('schemaVersion')).toBe(SCHEMA_VERSION);
    expect((area.peek('settings') as { retentionDays: number }).retentionDays).toBe(90);
  });

  it('resetStore restores clean defaults (FR-4.5 local reset path)', async () => {
    const area = new FakeArea();
    await area.set({
      settings: { retentionDays: 7 },
      rules: { r1: { id: 'r1', domain: 'a.com', dailyLimitMin: 1, updatedAt: 1 } },
    });
    await resetStore(area);
    await expect(getStore(area, 'settings')).resolves.toEqual(DEFAULT_SETTINGS);
    await expect(getStore(area, 'rules')).resolves.toEqual({});
    await expect(getStore(area, 'schemaVersion')).resolves.toBe(SCHEMA_VERSION);
    expect(DEFAULT_STORE.schemaVersion).toBe(SCHEMA_VERSION); // sanity on the constant
  });
});

describe('defaultArea (stubbed browser)', () => {
  it('wraps browser.storage.local', () => {
    const fake: StorageArea = { get: async () => ({}), set: async () => undefined };
    vi.stubGlobal('browser', { storage: { local: fake } });
    expect(defaultArea()).toBe(fake);
    vi.unstubAllGlobals();
  });
});

describe('ensureSchema back-fill', () => {
  it('fills missing container keys on a partial legacy store', async () => {
    const area = new FakeArea();
    await area.set({
      // Deliberately minimal: only usage exists â€” settings, rules, extensions,
      // and currentSession are all absent.
      usage: { '2026-10-21': { date: '2026-10-21', byDomain: { 'a.net': 3 } } },
    });
    const store = await ensureSchema(area);
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
    expect(store.extensions).toEqual([]);
    expect(store.currentSession).toBeNull();
    expect(store.schemaVersion).toBe(SCHEMA_VERSION);
    expect((store.usage as StoreShape['usage'])['2026-10-21']?.byDomain['a.net']).toBe(3);
  });
});

describe('onStoreChanged', () => {
  it('receives typed changes and unsubscribes cleanly', () => {
    const source = new FakeChangedSource();
    const listener = vi.fn();
    const unsubscribe = onStoreChanged(listener, source.storageChangedSource());

    source.fire({ settings: { newValue: { a: 1 } } }, 'local');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].settings?.newValue).toEqual({ a: 1 });

    // Other storage areas (sync, session, managed) must not leak in.
    source.fire({ settings: { newValue: 2 } }, 'sync');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    source.fire({ settings: { newValue: 3 } }, 'local');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
