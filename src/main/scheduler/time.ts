// Time helpers for the scheduler. Pure functions only: no Electron, no I/O.
// Everything works in epoch milliseconds so tests can pass any "now".

import type { ReminderItem } from '../../shared/types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Epoch ms for a calendar date at a wall-clock time in the computer's time
 * zone. `date` is YYYY-MM-DD and `time` is HH:mm.
 *
 * `new Date("2026-11-12")` would be parsed as UTC midnight, which is the
 * previous evening in US time zones. Building the date from parts keeps it on
 * the right local day.
 */
export function atLocalTime(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0).getTime();
}

/**
 * When the item's event happens, in epoch ms.
 * - With a time: the exact instant. Notion sends an offset, so `Date.parse`
 *   converts it to local time for us.
 * - Date only: the morning time on that day.
 * Returns NaN if the stored value cannot be read.
 */
export function eventTime(item: ReminderItem, morningTime: string): number {
  if (item.hasTime) return Date.parse(item.start);
  return atLocalTime(item.start.slice(0, 10), morningTime);
}

/** Epoch ms of local midnight at the start of the day containing `t`. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Epoch ms of local midnight at the start of the day after `t`. */
export function startOfNextDay(t: number): number {
  const d = new Date(startOfDay(t));
  // setDate handles month ends and daylight saving shifts correctly, which
  // adding 24 hours would not.
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** True when both instants fall on the same local calendar day. */
export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Format an epoch ms as a local YYYY-MM-DD date. */
export function toLocalDate(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Shift a YYYY-MM-DD date by a number of days (negative goes back). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return toLocalDate(new Date(y!, (m ?? 1) - 1, (d ?? 1) + days).getTime());
}
