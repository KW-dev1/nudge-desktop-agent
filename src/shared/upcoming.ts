// Sorting and grouping for the Upcoming tab. Pure, so it is unit tested and
// could run on either side.

import type { ReminderItem } from './types';

export type UpcomingGroupName = 'Overdue' | 'Today' | 'Tomorrow' | 'Later';

export type UpcomingRow = {
  item: ReminderItem;
  /** Epoch ms used for sorting: the start, or the morning time for date-only items. */
  at: number;
};

export type UpcomingGroup = { name: UpcomingGroupName; rows: UpcomingRow[] };

function localMidnight(t: number, addDays = 0): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + addDays);
  return d.getTime();
}

/** Same rule as the scheduler: exact time, or the morning time on the date. */
function eventAt(item: ReminderItem, morningTime: string): number {
  if (item.hasTime) return Date.parse(item.start);
  const [y, m, d] = item.start.slice(0, 10).split('-').map(Number);
  const [hh, mm] = morningTime.split(':').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0).getTime();
}

/**
 * Split items into Today, Tomorrow, and Later, sorted by time.
 *
 * Done items are left out. Meetings that already started are left out too.
 * Unfinished tasks and follow-ups from before today go in an extra Overdue
 * group, because they still need doing.
 */
export function groupUpcoming(items: ReminderItem[], now: number, morningTime: string): UpcomingGroup[] {
  const today = localMidnight(now);
  const tomorrow = localMidnight(now, 1);
  const dayAfter = localMidnight(now, 2);

  const buckets: Record<UpcomingGroupName, UpcomingRow[]> = { Overdue: [], Today: [], Tomorrow: [], Later: [] };

  for (const item of items) {
    if (item.done) continue;
    const at = eventAt(item, morningTime);
    if (Number.isNaN(at)) continue;

    if (at < today) {
      if (item.kind !== 'meeting') buckets.Overdue.push({ item, at });
    } else if (at < tomorrow) {
      // A timed meeting earlier today is over. Date-only meetings and tasks
      // stay listed for the whole day.
      if (item.kind === 'meeting' && item.hasTime && at < now) continue;
      buckets.Today.push({ item, at });
    } else if (at < dayAfter) {
      buckets.Tomorrow.push({ item, at });
    } else {
      buckets.Later.push({ item, at });
    }
  }

  return (['Overdue', 'Today', 'Tomorrow', 'Later'] as const)
    .map((name) => ({
      name,
      rows: buckets[name].sort((a, b) => a.at - b.at || a.item.title.localeCompare(b.item.title)),
    }))
    .filter((group) => group.rows.length > 0);
}
