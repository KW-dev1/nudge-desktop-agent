import { randomUUID } from 'node:crypto';
import Store from 'electron-store';
import { validateReminderInput } from '../../shared/reminders';
import type { ManualReminder } from '../../shared/types';

// reminders.json in the app data folder. Works with no network and no token.
const store = new Store<{ reminders: ManualReminder[] }>({
  name: 'reminders',
  defaults: { reminders: [] },
});

export function listReminders(): ManualReminder[] {
  return store.get('reminders');
}

/** Create a reminder, or update the one with the same id. */
export function saveReminder(input: unknown): ManualReminder {
  const clean = validateReminderInput(input);
  const all = listReminders();
  const existing = clean.id ? all.find((r) => r.id === clean.id) : undefined;
  const saved: ManualReminder = {
    id: existing?.id ?? randomUUID(),
    title: clean.title,
    kind: clean.kind,
    date: clean.date,
    time: clean.time,
    note: clean.note,
    done: clean.done,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  store.set('reminders', existing ? all.map((r) => (r.id === saved.id ? saved : r)) : [...all, saved]);
  return saved;
}

export function deleteReminder(id: string): void {
  store.set(
    'reminders',
    listReminders().filter((r) => r.id !== id),
  );
}

/** Set the done flag. Throws if the reminder no longer exists. */
export function setReminderDone(id: string, done: boolean): void {
  const all = listReminders();
  if (!all.some((r) => r.id === id)) throw new Error('That reminder no longer exists.');
  store.set(
    'reminders',
    all.map((r) => (r.id === id ? { ...r, done } : r)),
  );
}
