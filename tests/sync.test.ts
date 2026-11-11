import { describe, expect, it, vi } from 'vitest';
import type { ReminderSourceAdapter } from '../src/main/sources/types';
import { SyncService, syncRange, type CacheStore, type SourceCache } from '../src/main/sync';
import { at, meeting, task } from './helpers';

function memoryCache(): CacheStore & { data: Record<string, SourceCache> } {
  const data: Record<string, SourceCache> = {};
  let lastSync: number | null = null;
  return {
    data,
    get: (id) => data[id],
    set: (id, value) => void (data[id] = value),
    getLastSync: () => lastSync,
    setLastSync: (t) => void (lastSync = t),
    clear: () => {
      for (const key of Object.keys(data)) delete data[key];
      lastSync = null;
    },
  };
}

function setup(options: { hasToken?: boolean } = {}) {
  const meetings: ReminderSourceAdapter = {
    id: 'notion-meeting',
    label: 'Meetings',
    remote: true,
    fetch: vi.fn(async () => [meeting()]),
  };
  const tasks: ReminderSourceAdapter = {
    id: 'notion-task',
    label: 'Todo List',
    remote: true,
    fetch: vi.fn(async () => [task()]),
  };
  const manual: ReminderSourceAdapter = {
    id: 'manual',
    label: 'Manual reminders',
    remote: false,
    fetch: vi.fn(async () => [task({ id: 'r1', source: 'manual' })]),
  };
  const cache = memoryCache();
  const onChange = vi.fn();
  const sync = new SyncService({
    sources: [meetings, tasks, manual],
    cache,
    hasToken: () => options.hasToken ?? true,
    onChange,
    log: () => {},
    now: () => at(12),
  });
  return { sync, cache, meetings, tasks, manual, onChange };
}

describe('sync window (section 10)', () => {
  it('covers yesterday through 14 days ahead', () => {
    expect(syncRange(at(12))).toEqual({ from: '2026-11-10', to: '2026-11-25' });
  });
});

describe('sync', () => {
  it('fetches every source and caches remote results', async () => {
    const { sync, cache } = setup();
    await sync.syncNow();
    expect(sync.items().map((i) => i.id).sort()).toEqual(['m1', 'r1', 't1']);
    expect(cache.data['notion-meeting']!.lastSuccess).toBe(at(12));
    expect(sync.status().lastSync).toBe(at(12));
    // Manual reminders are local and never written to the cache.
    expect(cache.data['manual']).toBeUndefined();
  });

  it('keeps cached items and records the error when Notion is unreachable', async () => {
    const { sync, meetings } = setup();
    await sync.syncNow();
    vi.mocked(meetings.fetch).mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND api.notion.com'));
    await sync.syncNow();

    // The meeting from the last good sync is still there for the scheduler.
    expect(sync.items().some((i) => i.id === 'm1')).toBe(true);
    const status = sync.status().sources.find((s) => s.id === 'notion-meeting')!;
    expect(status.error).toMatch(/ENOTFOUND/);
    expect(status.lastSuccess).toBe(at(12));
  });

  it('still updates the other sources when one fails', async () => {
    const { sync, meetings, cache } = setup();
    vi.mocked(meetings.fetch).mockRejectedValueOnce(new Error('boom'));
    await sync.syncNow();
    expect(cache.data['notion-task']!.items).toHaveLength(1);
    expect(sync.status().lastSync).toBeNull();
  });

  it('clears the error after the next successful sync', async () => {
    const { sync, meetings } = setup();
    vi.mocked(meetings.fetch).mockRejectedValueOnce(new Error('boom'));
    await sync.syncNow();
    await sync.syncNow();
    expect(sync.status().sources.every((s) => s.error === null)).toBe(true);
  });

  it('works with no Notion token: manual reminders only, no remote calls', async () => {
    const { sync, meetings, tasks } = setup({ hasToken: false });
    await sync.syncNow();
    expect(sync.items().map((i) => i.id)).toEqual(['r1']);
    expect(meetings.fetch).not.toHaveBeenCalled();
    expect(tasks.fetch).not.toHaveBeenCalled();
    expect(sync.status().hasToken).toBe(false);
  });

  it('shares one run between overlapping calls', async () => {
    const { sync, meetings } = setup();
    await Promise.all([sync.syncNow(), sync.syncNow(), sync.syncNow()]);
    expect(meetings.fetch).toHaveBeenCalledTimes(1);
  });

  it('marks an item done in the cache without waiting for a sync', async () => {
    const { sync } = setup();
    await sync.syncNow();
    sync.markDoneInCache(task());
    expect(sync.items().find((i) => i.id === 't1')!.done).toBe(true);
  });

  it('only syncs again once the interval has passed', async () => {
    let now = at(12);
    const fetch = vi.fn(async () => []);
    const sync = new SyncService({
      sources: [{ id: 'notion-meeting', label: 'Meetings', remote: true, fetch }],
      cache: memoryCache(),
      hasToken: () => true,
      onChange: () => {},
      log: () => {},
      now: () => now,
    });
    await sync.syncNow();
    now += 60_000;
    sync.maybeSync(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 60_000;
    sync.maybeSync(2);
    await sync.syncNow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
