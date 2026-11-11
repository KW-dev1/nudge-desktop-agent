import Store from 'electron-store';
import type { MonthCache, MonthCacheStore } from '../notion/months';
import type { SourceCache } from '../sync';

// cache.json: the last successful result from each remote source. When
// Notion is unreachable the scheduler keeps working from this copy.
const store = new Store<{ sources: Record<string, SourceCache>; lastSync: number | null; months: MonthCache | null }>({
  name: 'cache',
  defaults: { sources: {}, lastSync: null, months: null },
});

export const cacheStore = {
  get(id: string): SourceCache | undefined {
    return store.get('sources')[id];
  },
  set(id: string, value: SourceCache): void {
    store.set('sources', { ...store.get('sources'), [id]: value });
  },
  getLastSync(): number | null {
    return store.get('lastSync');
  },
  setLastSync(at: number): void {
    store.set('lastSync', at);
  },
  /** Forget everything cached. Used when the Notion token is removed. */
  clear(): void {
    store.set({ sources: {}, lastSync: null, months: null });
  },
};

/** The discovered monthly task table IDs (see notion/months.ts). */
export const monthCacheStore: MonthCacheStore = {
  get: () => store.get('months'),
  set: (cache) => store.set('months', cache),
};
