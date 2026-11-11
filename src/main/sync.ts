// Fetches items from every source, caches remote results, and reports sync
// status. No Electron imports: storage and sources are injected, so the
// offline rules are unit tested.

import type { ReminderItem, SourceStatus, SyncStatus } from '../shared/types';
import { addDays, toLocalDate } from './scheduler/time';
import type { FetchRange, ReminderSourceAdapter } from './sources/types';

/** What is kept on disk for one remote source. */
export type SourceCache = {
  items: ReminderItem[];
  lastSuccess: number | null;
  error: string | null;
};

export type CacheStore = {
  get(id: string): SourceCache | undefined;
  set(id: string, value: SourceCache): void;
  getLastSync(): number | null;
  setLastSync(at: number): void;
  clear(): void;
};

export type SyncDeps = {
  sources: ReminderSourceAdapter[];
  cache: CacheStore;
  /** Remote sources are skipped until a Notion token is saved. */
  hasToken: () => boolean;
  /** Called whenever items or status change, so windows can refresh. */
  onChange: () => void;
  log: (message: string) => void;
  now?: () => number;
};

/** Sync window: items dated from yesterday through 14 days ahead. */
export function syncRange(now: number): FetchRange {
  const today = toLocalDate(now);
  return { from: addDays(today, -1), to: addDays(today, 14) };
}

const EMPTY: SourceCache = { items: [], lastSuccess: null, error: null };

export class SyncService {
  /** Items from local sources (manual reminders). Never cached to disk. */
  private local: ReminderItem[] = [];
  private running: Promise<void> | null = null;
  private lastAttempt = 0;
  private now: () => number;

  constructor(private deps: SyncDeps) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * Every known item: the cached copy of each remote source plus local
   * items. Synchronous and never touches the network, so the scheduler can
   * call it on every tick, online or not.
   */
  items(): ReminderItem[] {
    const remote = this.deps.sources
      .filter((s) => s.remote)
      .flatMap((s) => this.deps.cache.get(s.id)?.items ?? []);
    return [...remote, ...this.local];
  }

  /** Re-read local sources. Call after a manual reminder changes. */
  async refreshLocal(): Promise<void> {
    const range = syncRange(this.now());
    const lists = await Promise.all(this.deps.sources.filter((s) => !s.remote).map((s) => s.fetch(range)));
    this.local = lists.flat();
    this.deps.onChange();
  }

  /**
   * Fetch every remote source. A source that fails keeps its cached items
   * and records the error; the others still update. Calls made while a sync
   * is running share that run instead of starting another.
   */
  syncNow(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = null;
      this.deps.onChange();
    });
    return this.running;
  }

  /** Sync if the interval has passed since the last attempt. */
  maybeSync(intervalMinutes: number): void {
    if (this.now() - this.lastAttempt >= intervalMinutes * 60_000) void this.syncNow();
  }

  status(): SyncStatus {
    const sources: SourceStatus[] = this.deps.sources
      .filter((s) => s.remote)
      .map((s) => {
        const cached = this.deps.cache.get(s.id) ?? EMPTY;
        return { id: s.id, label: s.label, lastSuccess: cached.lastSuccess, error: cached.error };
      });
    return {
      syncing: this.running !== null,
      hasToken: this.deps.hasToken(),
      lastSync: this.deps.cache.getLastSync(),
      sources,
    };
  }

  /**
   * Flip an item to done in the cache right after the source accepted the
   * change, so it stops alerting without waiting for the next sync.
   */
  markDoneInCache(item: ReminderItem): void {
    // Adapter IDs match item sources, so the source name is the cache key.
    const cached = this.deps.cache.get(item.source);
    if (!cached) return;
    this.deps.cache.set(item.source, {
      ...cached,
      items: cached.items.map((i) => (i.id === item.id ? { ...i, done: true } : i)),
    });
    this.deps.onChange();
  }

  /** Drop all cached remote data (the token was removed). */
  clearRemote(): void {
    this.deps.cache.clear();
    this.deps.onChange();
  }

  /** The adapter that produced an item. Adapter IDs match item sources. */
  sourceFor(item: ReminderItem): ReminderSourceAdapter | undefined {
    return this.deps.sources.find((s) => s.id === item.source);
  }

  private async run(): Promise<void> {
    this.lastAttempt = this.now();
    await this.refreshLocal();
    if (!this.deps.hasToken()) return;
    this.deps.onChange(); // show "Syncing…" right away

    const range = syncRange(this.now());
    let allOk = true;
    for (const source of this.deps.sources.filter((s) => s.remote)) {
      const previous = this.deps.cache.get(source.id) ?? EMPTY;
      try {
        const items = await source.fetch(range);
        this.deps.cache.set(source.id, { items, lastSuccess: this.now(), error: null });
      } catch (error) {
        allOk = false;
        const message = error instanceof Error ? error.message : String(error);
        // Keep the last good items. Alerts keep firing from the cache.
        this.deps.cache.set(source.id, { ...previous, error: message });
        this.deps.log(`Sync failed for ${source.label}: ${message}`);
      }
    }
    if (allOk) this.deps.cache.setLastSync(this.now());
  }
}
