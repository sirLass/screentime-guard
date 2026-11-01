/**
 * Storage layer (plan milestone M1, PRD §6.2, §7.5).
 *
 * Typed wrapper over `chrome.storage.local`:
 *  - get/set/update with defaults for Settings, Rule, TimeExtension, UsageDay
 *  - schema versioning and a migration runner (updates must not wipe data)
 *  - atomic updates to avoid races between popup/options and the service worker
 *  - a change-listener utility so the UI reacts to updates
 *
 * All operations wrapped in error handling with safe fallbacks.
 */
import type { Rule, Session, Settings, TimeExtension, UsageDay } from '@screentime-guard/shared';

/**
 * Everything ScreenTime Guard persists, one key per slice (PRD §7.5).
 * Data shapes are flat JSON only — `chrome.storage` serializes transparently,
 * but Map/Set/DOM objects do not survive a `.get()` round-trip.
 */
export type StoreShape = {
  /** For migrations, the bump version lives in its own top-level key. */
  schemaVersion: number;
  settings: Settings;
  /** Rules indexed by their id — O(1) add/update/delete. */
  rules: Record<string, Rule>;
  /** Granted +N-minute extensions for the current or recent days (FR-2.5). */
  extensions: TimeExtension[];
  /** Day-keyed usage buckets, e.g. `"2026-11-01"`. */
  usage: Record<string, UsageDay>;
  /** The in-progress tracking session, or null when idle/no tab (PRD §7.4). */
  currentSession: Session | null;
};

/** Bump when `StoreShape` changes; every transition needs a `MIGRATIONS` entry. */
export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  pinHash: '',
  pinSalt: '',
  idleThresholdSec: 60,
  warnBeforeMin: 5,
  retentionDays: 90,
  syncEnabled: false,
};

export const DEFAULT_STORE: StoreShape = {
  schemaVersion: SCHEMA_VERSION,
  settings: { ...DEFAULT_SETTINGS },
  rules: {},
  extensions: [],
  usage: {},
  currentSession: null,
};

/**
 * Minimal promise-based shape of `browser.storage.local`. Kept nominal (not
 * just casting the whole area) so unit tests can inject a Map-backed fake.
 */
export interface StorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** Real adapter — never touched by unit tests (they inject fakes instead). */
export function defaultArea(): StorageArea {
  return browser.storage.local as unknown as StorageArea;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// ---------------------------------------------------------------------------
// Typed get / set / update
// ---------------------------------------------------------------------------

/** Read one slice, falling back to (and cloning) its default when missing. */
export async function getStore<K extends keyof StoreShape>(
  area: StorageArea,
  key: K,
): Promise<StoreShape[K]> {
  const raw = await area.get([key as string]);
  const value = raw[key as string];
  if (value === undefined || value === null) return cloneDefault(key);
  return mergeDefault(key, value);
}

/** Write one slice whole. Callers must pass fully-formed validated data. */
export async function setStore<K extends keyof StoreShape>(
  area: StorageArea,
  key: K,
  value: StoreShape[K],
): Promise<void> {
  await area.set({ [key]: value });
}

function cloneDefault<K extends keyof StoreShape>(key: K): StoreShape[K] {
  switch (key) {
    case 'settings':
      return { ...DEFAULT_STORE.settings } as StoreShape[K];
    case 'rules':
      return {} as StoreShape[K];
    case 'extensions':
      return [] as unknown as StoreShape[K];
    case 'usage':
      return {} as StoreShape[K];
    case 'currentSession':
      return null as StoreShape[K];
    case 'schemaVersion':
      return SCHEMA_VERSION as StoreShape[K];
  }
}

/**
 * Fill in keys added in newer schemas on data stored by an older build, so a
 * stale settings object loaded after an update can never crash dereference.
 */
function mergeDefault<K extends keyof StoreShape>(key: K, value: unknown): StoreShape[K] {
  if (key === 'settings' && isObj(value)) {
    return { ...DEFAULT_STORE.settings, ...(value as Partial<Settings>) } as StoreShape[K];
  }
  return value as StoreShape[K];
}

const updateQueues = new Map<string, Promise<unknown>>();

/**
 * Atomic read-modify-write for one slice. All calls for the same key are
 * serialized behind a per-key promise queue — two concurrent `update` calls
 * can never interleave read/write halves, so increments are never lost.
 *
 * (This removes races within one context — popup vs. the service worker are
 * separate contexts and coordinate instead via the message protocol in
 * `messages.ts` and single-writer discipline: the service worker owns usage.)
 */
export function updateStore<K extends keyof StoreShape>(
  area: StorageArea,
  key: K,
  mutate: (current: StoreShape[K]) => StoreShape[K],
): Promise<StoreShape[K]> {
  const pending = (updateQueues.get(key as string) ?? Promise.resolve()).catch(() => undefined);
  const job = pending.then(async () => {
    const current = await getStore(area, key);
    const next = mutate(current);
    await setStore(area, key, next);
    return next;
  });
  // The queue never rejects — a failed job must not poison later ones; only
  // the caller's returned promise rejects.
  updateQueues.set(
    key as string,
    job.catch(() => undefined),
  );
  return job;
}

// ---------------------------------------------------------------------------
// Schema versioning + migrations
// ---------------------------------------------------------------------------

export type Migration = {
  /** Apply when stored version equals `from`. */
  from: number;
  /** In-place fix-up of raw stored data to the next version. */
  apply(data: Record<string, unknown>): void;
};

/**
 * Historical migrations. Never reorder or delete entries — each must also run
 * on data written by *released* versions of the extension.
 */
export const MIGRATIONS: Migration[] = [
  {
    // v0 (scaffold without a version marker) → v1: settings slice appears.
    from: 0,
    apply(data) {
      data.settings = isObj(data.settings)
        ? data.settings
        : {
            pinHash: '',
            pinSalt: '',
            idleThresholdSec: 60,
            warnBeforeMin: 5,
            syncEnabled: false,
          };
    },
  },
  {
    // v1 → v2: usage retention window was added to settings (FR-6.4).
    from: 1,
    apply(data) {
      const settings = isObj(data.settings) ? data.settings : (data.settings = {});
      if (typeof settings.retentionDays !== 'number') settings.retentionDays = 90;
    },
  },
];

/**
 * Pure migration core over a raw storage snapshot: applies every applicable
 * step in ascending order and stamps the final version. Pure so migration
 * math and the no-wipe guarantee are unit-testable without the API.
 */
export function migrateStore(raw: Record<string, unknown>): {
  store: Record<string, unknown>;
  from: number;
  to: number;
} {
  const from = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  // Deep-copy: migrations patch nested slices (settings) in place, and the
  // caller's snapshot must remain untouched (purity keeps tests honest).
  const store = structuredClone(raw) as Record<string, unknown>;

  // A *newer* build's data downgraded to an older build: leave it untouched —
  // running stale migrations on newer data could lose information.
  if (from > SCHEMA_VERSION) return { store, from, to: from };

  let to = from;
  for (const m of MIGRATIONS) {
    if (m.from >= from && m.from < SCHEMA_VERSION) {
      m.apply(store);
      to += 1;
      store.schemaVersion = to;
    }
  }
  return { store, from, to };
}

/**
 * Verify (or initialize) the store's schema before first use. Fresh installs
 * get the full default store; existing data is migrated in place, and missing
 * newer container keys are filled — **existing data is never dropped**.
 * Returns the current complete store.
 */
export async function ensureSchema(area: StorageArea): Promise<StoreShape> {
  const raw = await area.get(null);
  const hasData = Object.keys(raw).length > 0;

  if (!hasData) {
    // Fresh install — write the default store once so `schemaVersion` is on
    // disk before anything else runs (startup in MV3 runs migrations late).
    await area.set({ ...DEFAULT_STORE });
    return { ...DEFAULT_STORE };
  }

  const { store } = migrateStore(raw);

  // Fill any container keys missing between revisions (merge defaults only
  // into `settings`; containers get their own defaults when absent).
  // Fill any container keys missing between revisions. Settings always merge
  // onto the current defaults — legacy settings objects predate `schemaVersion`
  // inside the type, and merge also fills keys added by newer revisions.
  store.settings = {
    ...DEFAULT_STORE.settings,
    ...(isObj(store.settings) ? store.settings : {}),
  } as Settings;
  if (!isObj(store.rules) && store.rules !== undefined) store.rules = DEFAULT_STORE.rules;
  if (!Array.isArray(store.extensions)) store.extensions = DEFAULT_STORE.extensions;
  if (!isObj(store.usage) && store.usage !== undefined) store.usage = DEFAULT_STORE.usage;
  if (store.currentSession === undefined) store.currentSession = null;
  store.schemaVersion = SCHEMA_VERSION;

  await area.set(store);
  return store as StoreShape;
}

/** Wipe every slice (the documented, PIN-gated local reset path, FR-4.5). */
export async function resetStore(area: StorageArea): Promise<void> {
  await area.set({ ...DEFAULT_STORE });
}

// ---------------------------------------------------------------------------
// Change listener
// ---------------------------------------------------------------------------

export type StoreDelta = { oldValue?: unknown; newValue?: unknown };
export type StoreChange = Partial<Record<keyof StoreShape, StoreDelta>>;

/** Minimal structural shape of `browser.storage.onChanged` for fake injection. */
export interface StorageChangedSource {
  addListener(listener: (changes: unknown, areaName: string) => void): void;
  removeListener(listener: (changes: unknown, areaName: string) => void): void;
}

/**
 * Subscribe to store changes with real typing. Returns an unsubscribe
 * function — intended for React `useEffect` in the popup and options UI.
 */
export function onStoreChanged(
  listener: (changes: StoreChange) => void,
  source: StorageChangedSource = browser.storage.onChanged,
): () => void {
  const wrapped = (changes: unknown, areaName: string) => {
    if (areaName !== 'local') return;
    listener(changes as StoreChange);
  };
  source.addListener(wrapped);
  return () => source.removeListener(wrapped);
}
