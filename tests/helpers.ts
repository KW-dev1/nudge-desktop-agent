import type { ReminderItem } from '../src/shared/types';

/** Local wall-clock time on 2026-11-11 (a Wednesday) as epoch ms. */
export function at(hour: number, minute = 0, day = 11): number {
  return new Date(2026, 10, day, hour, minute, 0, 0).getTime();
}

/** ISO string with offset for an epoch ms, the way Notion sends datetimes. */
export function iso(t: number): string {
  return new Date(t).toISOString();
}

export function meeting(overrides: Partial<ReminderItem> = {}): ReminderItem {
  return {
    id: 'm1',
    source: 'notion-meeting',
    kind: 'meeting',
    title: 'Discovery call',
    start: iso(at(15)),
    hasTime: true,
    done: false,
    ...overrides,
  };
}

export function task(overrides: Partial<ReminderItem> = {}): ReminderItem {
  return {
    id: 't1',
    source: 'notion-task',
    kind: 'task',
    title: 'Send proposal',
    start: '2026-11-11',
    hasTime: false,
    done: false,
    ...overrides,
  };
}

export const CONFIG = { leadTimes: [60, 30], morningTime: '09:00' };
