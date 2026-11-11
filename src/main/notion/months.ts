// Finds the monthly task tables under the Todo List page at runtime.
//
//   Todo List (page)
//     2026-11 (child page)
//       Tasks – 2026-11 (inline database)
//     2026-12 (child page)
//       ...
//
// Nothing here is hard-coded per month, so on December 1 the 2026-12 table
// is picked up with no config change.

import type { NotionApi } from './client';
import { TODO_LIST } from './config';

export type MonthTable = { month: string; databaseId: string; dataSourceId: string };

/** What is remembered between syncs. */
export type MonthCache = {
  /** Tables found, by month (YYYY-MM). Months with no page yet are absent. */
  tables: Record<string, MonthTable>;
  /** Epoch ms of the last full lookup. */
  checkedAt: number;
  /** The current month at the last lookup. A new month forces a fresh one. */
  forMonth: string;
};

export type MonthCacheStore = { get(): MonthCache | null; set(cache: MonthCache | null): void };

const DAY = 24 * 60 * 60 * 1000;

/** "2026-11" for an epoch ms, in local time. */
export function monthOf(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The months whose tables are synced: the current month and the next, so
 * tasks due right after month end are picked up, plus last month on the 1st,
 * because the sync window reaches back to yesterday.
 */
export function monthsToSync(now: number): string[] {
  const d = new Date(now);
  const yesterday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return [...new Set([monthOf(yesterday), monthOf(now), monthOf(nextMonth)])];
}

/** Look up one month's table. Returns null when the page or database is not there yet. */
async function findTable(api: NotionApi, month: string, monthPages: Map<string, string>): Promise<MonthTable | null> {
  const pageId = monthPages.get(month);
  if (!pageId) return null;
  const children = await api.listChildren(pageId);
  const databases = children.filter((b) => b.type === 'child_database');
  // The month page holds one inline database. If someone adds another,
  // prefer the one named like "Tasks – 2026-11".
  const database = databases.find((b) => b.title.trim().toLowerCase().startsWith('tasks')) ?? databases[0];
  if (!database) return null;
  const [dataSourceId] = await api.dataSourceIds(database.id);
  if (!dataSourceId) return null;
  return { month, databaseId: database.id, dataSourceId };
}

/**
 * The task tables for the months being synced (see monthsToSync).
 *
 * Found IDs are cached and reused for a day. A full lookup runs again when
 * the cache is a day old, when the month changes, or when a wanted month is
 * still missing (so a month page created later today shows up on the next
 * sync). A month with no page is skipped without an error.
 */
export async function resolveMonthTables(api: NotionApi, store: MonthCacheStore, now: number): Promise<MonthTable[]> {
  const wanted = monthsToSync(now);
  const cache = store.get();
  const fresh = cache !== null && cache.forMonth === monthOf(now) && now - cache.checkedAt < DAY;
  if (fresh && wanted.every((m) => cache.tables[m])) {
    return wanted.map((m) => cache.tables[m]!);
  }

  // One call lists every month page under Todo List.
  const children = await api.listChildren(TODO_LIST.pageId);
  const monthPages = new Map(children.filter((b) => b.type === 'child_page').map((b) => [b.title.trim(), b.id]));

  const tables: Record<string, MonthTable> = {};
  for (const month of wanted) {
    // Reuse a still-fresh ID instead of looking the same table up again.
    const known = fresh ? cache.tables[month] : undefined;
    const table = known ?? (await findTable(api, month, monthPages));
    if (table) tables[month] = table;
  }
  store.set({ tables, checkedAt: now, forMonth: monthOf(now) });
  return Object.values(tables);
}
