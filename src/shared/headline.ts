// Builds the popup headline ("Meeting in 30 minutes"). Lives in shared code
// because the popup recomputes it while it stays open, so a popup left on
// screen for ten minutes does not keep claiming "in 30 minutes".

import type { ReminderKind } from './types';

const MINUTE = 60_000;

/** "1 minute", "45 minutes", "1 hour", "1 hour 15 minutes", "2 hours". */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export type HeadlineInput = {
  kind: ReminderKind;
  hasTime: boolean;
  /** Epoch ms of the meeting start or the due time. */
  eventAt: number;
};

/**
 * The headline for an alert as of `now`. It always reflects the real time
 * left, so an alert that fires late (app was closed, or it was snoozed) says
 * "Meeting in 42 minutes" instead of repeating its nominal lead time.
 */
export function headlineFor(input: HeadlineInput, now: number): string {
  if (input.kind === 'meeting') {
    // A meeting with only a date has no countdown to show.
    if (!input.hasTime) return 'Meeting today';
    const minutesLeft = Math.round((input.eventAt - now) / MINUTE);
    if (minutesLeft > 0) return `Meeting in ${formatDuration(minutesLeft)}`;
    if (minutesLeft === 0) return 'Meeting starting now';
    // Only reachable through snooze, which keeps an alert alive for up to
    // 15 minutes past the start.
    return `Meeting started ${formatDuration(-minutesLeft)} ago`;
  }

  const label = input.kind === 'follow-up' ? 'Follow-up' : 'Task';
  if (!input.hasTime) {
    return sameLocalDay(input.eventAt, now) ? `${label} due today` : `${label} overdue`;
  }
  const minutesLate = Math.round((now - input.eventAt) / MINUTE);
  if (minutesLate <= 1) return `${label} due now`;
  return `${label} overdue by ${formatDuration(minutesLate)}`;
}
