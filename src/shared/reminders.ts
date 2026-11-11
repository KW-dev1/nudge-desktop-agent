// Validation and mapping for manual reminders. Pure, so it runs in tests and
// on both sides of the IPC boundary.

import type { ManualReminder, ReminderItem, ReminderKind } from './types';

const KINDS: ReminderKind[] = ['meeting', 'task', 'follow-up'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** What the Reminders form sends. `id` is present when editing. */
export type ReminderInput = {
  id?: string;
  title: string;
  kind: ReminderKind;
  date: string;
  time?: string;
  note?: string;
  done?: boolean;
};

/**
 * Check a reminder coming from the form and return a clean copy.
 * Throws an Error with a message the form can show next to the field.
 */
export function validateReminderInput(input: unknown): Required<Omit<ReminderInput, 'id' | 'time'>> & {
  id?: string;
  time?: string;
} {
  const r = (input ?? {}) as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (!title) throw new Error('Title is required.');
  if (!KINDS.includes(r.kind as ReminderKind)) throw new Error('Pick a kind: meeting, task, or follow-up.');
  if (typeof r.date !== 'string' || !DATE.test(r.date) || Number.isNaN(Date.parse(r.date))) {
    throw new Error('Date is required.');
  }
  // An empty time field means "date only".
  const time = typeof r.time === 'string' && r.time !== '' ? r.time : undefined;
  if (time !== undefined && !TIME.test(time)) throw new Error('Time must look like 14:30.');
  return {
    id: typeof r.id === 'string' && r.id ? r.id : undefined,
    title: title.slice(0, 200),
    kind: r.kind as ReminderKind,
    date: r.date,
    time,
    note: typeof r.note === 'string' ? r.note.trim().slice(0, 2000) : '',
    done: r.done === true,
  };
}

/** Convert a stored manual reminder to the shape the scheduler works with. */
export function manualToItem(r: ManualReminder): ReminderItem {
  return {
    id: r.id,
    source: 'manual',
    kind: r.kind,
    title: r.title,
    // No offset on purpose: a datetime without one is read as local time.
    start: r.time ? `${r.date}T${r.time}` : r.date,
    hasTime: Boolean(r.time),
    done: r.done,
    notes: r.note || undefined,
  };
}
