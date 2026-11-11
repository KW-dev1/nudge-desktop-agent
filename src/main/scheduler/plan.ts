// Turns reminder items into planned alerts (section 5.1 and 5.2 of the spec).
// Pure logic: the same items and settings always give the same plan.

import type { AlertKind, PlannedAlert, ReminderItem } from '../../shared/types';
import { MINUTE, eventTime } from './time';

/** The settings the scheduler depends on. A subset of the full Settings. */
export type SchedulerConfig = {
  leadTimes: number[];
  morningTime: string;
};

/**
 * Stable key for an alert: source + item ID + alert kind + scheduled time.
 *
 * The scheduled-time part is the item's own start value. If the time changes
 * in Notion the key changes, so the alert fires again for the new time. It is
 * deliberately not the computed fire instant: that would shift whenever the
 * user edits the morning time or lead times and re-fire alerts already seen.
 */
export function alertKey(item: ReminderItem, alertKind: AlertKind, eventAt: number): string {
  const scheduled = item.hasTime ? new Date(eventAt).toISOString() : item.start.slice(0, 10);
  return [item.source, item.id, alertKind, scheduled].join('|');
}

/** Plan the alerts for one item. Done items and unreadable dates get none. */
export function planItem(item: ReminderItem, config: SchedulerConfig): PlannedAlert[] {
  if (item.done) return [];
  const eventAt = eventTime(item, config.morningTime);
  if (Number.isNaN(eventAt)) return [];

  const make = (alertKind: AlertKind, fireAt: number): PlannedAlert => ({
    key: alertKey(item, alertKind, eventAt),
    item,
    alertKind,
    fireAt,
    eventAt,
  });

  if (item.kind === 'meeting') {
    // Date only: one alert at the morning time on that day.
    if (!item.hasTime) return [make('day', eventAt)];
    // With a time: one alert per lead time before the start. Duplicates and
    // negative values in the setting are ignored.
    const leads = [...new Set(config.leadTimes)].filter((n) => Number.isFinite(n) && n >= 0);
    return leads.map((lead) => make(`lead-${lead}`, eventAt - lead * MINUTE));
  }

  // Tasks and follow-ups fire once: at their due time, or at the morning
  // time when they only have a date (eventTime already handles both).
  return [make('due', eventAt)];
}

/** Plan the alerts for every item. */
export function planAlerts(items: ReminderItem[], config: SchedulerConfig): PlannedAlert[] {
  return items.flatMap((item) => planItem(item, config));
}
