import type { NotionApi } from '../notion/client';
import { TODO_LIST } from '../notion/config';
import { dateRangeFilter, taskItem } from '../notion/mapping';
import { resolveMonthTables, type MonthCacheStore } from '../notion/months';
import type { ReminderItem } from '../../shared/types';
import type { ReminderSourceAdapter } from './types';

/**
 * Tasks from the monthly task tables under the Notion Todo List page.
 * This is the only place the app writes to Notion: Mark done sets a task's
 * Status to Done.
 */
export function createNotionTasksSource(
  getApi: () => NotionApi,
  monthCache: MonthCacheStore,
  now: () => number = Date.now,
): ReminderSourceAdapter {
  return {
    id: 'notion-task',
    label: 'Todo List',
    remote: true,

    async fetch(range) {
      const api = getApi();
      const tables = await resolveMonthTables(api, monthCache, now());
      const filter = dateRangeFilter(TODO_LIST.props.due, range.from, range.to);

      const items: ReminderItem[] = [];
      for (const table of tables) {
        let pages;
        try {
          pages = await api.queryDataSource(table.dataSourceId, filter);
        } catch (error) {
          // A cached table ID may be stale (table deleted or recreated).
          // Forget the cache so the next sync looks the tables up again.
          monthCache.set(null);
          throw error;
        }
        for (const page of pages) {
          const item = taskItem(page);
          if (item) items.push(item);
        }
      }
      return items;
    },

    async markDone(item) {
      await getApi().setStatus(item.id, TODO_LIST.props.status, TODO_LIST.doneStatus);
    },
  };
}
