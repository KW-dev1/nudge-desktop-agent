import { describe, expect, it, vi } from 'vitest';
import type { NotionApi, NotionBlock } from '../src/main/notion/client';
import { TODO_LIST } from '../src/main/notion/config';
import { taskItem } from '../src/main/notion/mapping';
import { monthsToSync, resolveMonthTables, type MonthCache, type MonthCacheStore } from '../src/main/notion/months';
import { createNotionTasksSource } from '../src/main/sources/notionTasks';
import { date, status, taskPage } from './notionFixtures';

const nov11 = new Date(2026, 10, 11, 12).getTime();
const dec1 = new Date(2026, 11, 1, 8).getTime();
const HOUR = 3_600_000;

function memoryStore(initial: MonthCache | null = null): MonthCacheStore & { value: MonthCache | null } {
  const store = {
    value: initial,
    get: () => store.value,
    set: (v: MonthCache | null) => void (store.value = v),
  };
  return store;
}

/**
 * A fake workspace: the Todo List page with one child page per month, each
 * holding one inline database.
 */
function fakeApi(months: string[]) {
  const children: Record<string, NotionBlock[]> = {
    [TODO_LIST.pageId]: [
      ...months.map((m) => ({ id: `page-${m}`, type: 'child_page', title: m })),
      { id: 'page-notes', type: 'child_page', title: 'Notes' },
    ],
  };
  for (const m of months) {
    children[`page-${m}`] = [{ id: `db-${m}`, type: 'child_database', title: `Tasks – ${m}` }];
  }
  const api = {
    listChildren: vi.fn(async (id: string) => children[id] ?? []),
    dataSourceIds: vi.fn(async (databaseId: string) => [databaseId.replace('db-', 'ds-')]),
    queryDataSource: vi.fn(async (dataSourceId: string) => [taskPage({}, `task-in-${dataSourceId}`)]),
    setStatus: vi.fn(async () => {}),
  };
  return { api: api as unknown as NotionApi, mocks: api, children };
}

describe('mapping a task row (section 4.2)', () => {
  it('maps every property', () => {
    expect(taskItem(taskPage())).toEqual({
      id: 'task-1',
      source: 'notion-task',
      kind: 'task',
      title: 'Send proposal',
      start: '2026-11-12',
      hasTime: false,
      done: false,
      client: 'John',
      priority: 'High',
      notes: 'Use the new template',
      url: 'https://www.notion.so/task-1',
    });
  });

  it('reads Done from the status property', () => {
    expect(taskItem(taskPage({ Status: status('Done') }))!.done).toBe(true);
    expect(taskItem(taskPage({ Status: status('In Progress') }))!.done).toBe(false);
  });

  it('detects a due date with a time', () => {
    const item = taskItem(taskPage({ Due: date('2026-11-12T16:30:00.000-06:00') }))!;
    expect(item.hasTime).toBe(true);
  });

  it('skips a task with no due date', () => {
    expect(taskItem(taskPage({ Due: date(null) }))).toBeNull();
  });
});

describe('month table discovery (section 4.2)', () => {
  it('looks at the current month and the next', () => {
    expect(monthsToSync(nov11)).toEqual(['2026-11', '2026-12']);
  });

  it('also keeps last month on the 1st, since the sync window includes yesterday', () => {
    // December rolls over into January of the next year.
    expect(monthsToSync(dec1)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthsToSync(new Date(2026, 11, 2, 8).getTime())).toEqual(['2026-12', '2027-01']);
  });

  it('finds the database under each month page', async () => {
    const { api } = fakeApi(['2026-10', '2026-11', '2026-12']);
    const tables = await resolveMonthTables(api, memoryStore(), nov11);
    expect(tables).toEqual([
      { month: '2026-11', databaseId: 'db-2026-11', dataSourceId: 'ds-2026-11' },
      { month: '2026-12', databaseId: 'db-2026-12', dataSourceId: 'ds-2026-12' },
    ]);
  });

  it('skips a month whose page does not exist yet, without an error', async () => {
    const { api } = fakeApi(['2026-11']);
    const tables = await resolveMonthTables(api, memoryStore(), nov11);
    expect(tables.map((t) => t.month)).toEqual(['2026-11']);
  });

  it('skips a month page that has no database in it', async () => {
    const { api, children } = fakeApi(['2026-11', '2026-12']);
    children['page-2026-12'] = [];
    const tables = await resolveMonthTables(api, memoryStore(), nov11);
    expect(tables.map((t) => t.month)).toEqual(['2026-11']);
  });

  it('caches the IDs and makes no calls while the cache is fresh', async () => {
    const { api, mocks } = fakeApi(['2026-11', '2026-12']);
    const store = memoryStore();
    await resolveMonthTables(api, store, nov11);
    mocks.listChildren.mockClear();
    mocks.dataSourceIds.mockClear();

    const tables = await resolveMonthTables(api, store, nov11 + 2 * HOUR);
    expect(tables).toHaveLength(2);
    expect(mocks.listChildren).not.toHaveBeenCalled();
    expect(mocks.dataSourceIds).not.toHaveBeenCalled();
  });

  it('refreshes once a day', async () => {
    const { api, mocks } = fakeApi(['2026-11', '2026-12']);
    const store = memoryStore();
    await resolveMonthTables(api, store, nov11);
    mocks.listChildren.mockClear();
    await resolveMonthTables(api, store, nov11 + 25 * HOUR);
    expect(mocks.listChildren).toHaveBeenCalledWith(TODO_LIST.pageId);
  });

  it('refreshes when the month changes (acceptance: December 1)', async () => {
    const { api, mocks } = fakeApi(['2026-11', '2026-12']);
    const store = memoryStore();
    // Looked up late on November 30, so the cache is under a day old.
    await resolveMonthTables(api, store, dec1 - 10 * HOUR);
    mocks.listChildren.mockClear();
    const tables = await resolveMonthTables(api, store, dec1);
    expect(mocks.listChildren).toHaveBeenCalledWith(TODO_LIST.pageId);
    expect(tables.map((t) => t.month)).toEqual(['2026-11', '2026-12']);
    expect(store.value!.forMonth).toBe('2026-12');
  });

  it('picks up a month page created after the last lookup on the next sync', async () => {
    const first = fakeApi(['2026-11']);
    const store = memoryStore();
    await resolveMonthTables(first.api, store, nov11);

    const second = fakeApi(['2026-11', '2026-12']);
    const tables = await resolveMonthTables(second.api, store, nov11 + HOUR);
    expect(tables.map((t) => t.month)).toEqual(['2026-11', '2026-12']);
    // The table already known was not looked up again.
    expect(second.mocks.dataSourceIds).toHaveBeenCalledTimes(1);
  });
});

describe('Notion tasks source', () => {
  it('queries each month table and merges the tasks', async () => {
    const { api, mocks } = fakeApi(['2026-11', '2026-12']);
    const source = createNotionTasksSource(() => api, memoryStore(), () => nov11);
    const items = await source.fetch({ from: '2026-11-10', to: '2026-11-25' });

    expect(items.map((i) => i.id)).toEqual(['task-in-ds-2026-11', 'task-in-ds-2026-12']);
    expect(mocks.queryDataSource).toHaveBeenCalledWith('ds-2026-11', {
      and: [
        { property: 'Due', date: { on_or_after: '2026-11-10' } },
        { property: 'Due', date: { on_or_before: '2026-11-25' } },
      ],
    });
  });

  it('shows December tasks on December 1 with no config change (acceptance)', async () => {
    const { api } = fakeApi(['2026-11', '2026-12']);
    const source = createNotionTasksSource(() => api, memoryStore(), () => dec1);
    const items = await source.fetch({ from: '2026-11-30', to: '2026-12-15' });
    // November is still read on the 1st for tasks that were due yesterday.
    expect(items.map((i) => i.id)).toEqual(['task-in-ds-2026-11', 'task-in-ds-2026-12']);
  });

  it('marks a task done by setting Status to Done (acceptance)', async () => {
    const { api, mocks } = fakeApi(['2026-11']);
    const source = createNotionTasksSource(() => api, memoryStore(), () => nov11);
    await source.markDone!(taskItem(taskPage())!);
    expect(mocks.setStatus).toHaveBeenCalledWith('task-1', 'Status', 'Done');
  });

  it('passes a failed Mark done back to the caller', async () => {
    const { api, mocks } = fakeApi(['2026-11']);
    mocks.setStatus.mockRejectedValueOnce(new Error('offline'));
    const source = createNotionTasksSource(() => api, memoryStore(), () => nov11);
    await expect(source.markDone!(taskItem(taskPage())!)).rejects.toThrow('offline');
  });

  it('forgets cached table IDs when a query fails, so they are looked up again', async () => {
    const { api, mocks } = fakeApi(['2026-11', '2026-12']);
    const store = memoryStore();
    const source = createNotionTasksSource(() => api, store, () => nov11);
    await source.fetch({ from: 'a', to: 'b' });
    mocks.queryDataSource.mockRejectedValueOnce(new Error('object_not_found'));
    await expect(source.fetch({ from: 'a', to: 'b' })).rejects.toThrow('object_not_found');
    expect(store.value).toBeNull();
  });
});
