import type { ReminderItem } from '../../../shared/types';

const DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** Local Date for an item's start. Date-only values stay on their own day. */
export function startDate(item: ReminderItem): Date {
  if (item.hasTime) return new Date(item.start);
  const [y, m, d] = item.start.slice(0, 10).split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** "Wed, Nov 11 · 3:00 PM", or just "Wed, Nov 11" for date-only items. */
export function formatWhen(item: ReminderItem): string {
  const date = startDate(item);
  if (Number.isNaN(date.getTime())) return '';
  return item.hasTime ? `${DATE.format(date)} · ${TIME.format(date)}` : DATE.format(date);
}

/** "3:00 PM" for timed items, "All day" otherwise. */
export function formatTime(item: ReminderItem): string {
  return item.hasTime ? TIME.format(startDate(item)) : 'All day';
}

/** "2:41 PM" for an epoch ms. */
export function formatClock(t: number): string {
  return TIME.format(new Date(t));
}

export const KIND_LABEL = { meeting: 'Meeting', task: 'Task', 'follow-up': 'Follow-up' } as const;
