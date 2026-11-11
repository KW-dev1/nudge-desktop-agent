import { describe, expect, it } from 'vitest';
import { createManualSource } from '../src/main/sources/manual';
import { manualToItem, validateReminderInput } from '../src/shared/reminders';
import type { ManualReminder } from '../src/shared/types';

const base: ManualReminder = {
  id: 'r1',
  title: 'Call Ana',
  kind: 'follow-up',
  date: '2026-11-12',
  note: 'About the contract',
  done: false,
  createdAt: '2026-11-11T10:00:00.000Z',
};

describe('manual reminder mapping', () => {
  it('maps a date-only reminder', () => {
    expect(manualToItem(base)).toEqual({
      id: 'r1',
      source: 'manual',
      kind: 'follow-up',
      title: 'Call Ana',
      start: '2026-11-12',
      hasTime: false,
      done: false,
      notes: 'About the contract',
    });
  });

  it('maps a reminder with a time to a local datetime', () => {
    const item = manualToItem({ ...base, time: '14:30' });
    expect(item.start).toBe('2026-11-12T14:30');
    expect(item.hasTime).toBe(true);
    // No offset in the string, so it is read as local time.
    expect(new Date(item.start).getHours()).toBe(14);
  });

  it('has no Notion URL, so Open in Notion stays hidden', () => {
    expect(manualToItem(base).url).toBeUndefined();
  });

  it('leaves notes out when the note is empty', () => {
    expect(manualToItem({ ...base, note: '' }).notes).toBeUndefined();
  });
});

describe('manual reminder validation', () => {
  it('accepts a good reminder and trims it', () => {
    const r = validateReminderInput({ title: '  Call Ana ', kind: 'task', date: '2026-11-12', time: '' });
    expect(r).toMatchObject({ title: 'Call Ana', kind: 'task', date: '2026-11-12', note: '', done: false });
    expect(r.time).toBeUndefined();
  });

  it('requires a title, a known kind, and a real date', () => {
    expect(() => validateReminderInput({ title: ' ', kind: 'task', date: '2026-11-12' })).toThrow(/Title/);
    expect(() => validateReminderInput({ title: 'x', kind: 'party', date: '2026-11-12' })).toThrow(/kind/);
    expect(() => validateReminderInput({ title: 'x', kind: 'task', date: 'tomorrow' })).toThrow(/Date/);
  });

  it('rejects a malformed time', () => {
    expect(() => validateReminderInput({ title: 'x', kind: 'task', date: '2026-11-12', time: '9am' })).toThrow(
      /Time/,
    );
  });
});

describe('manual source', () => {
  it('returns stored reminders as items and marks them done locally', async () => {
    let stored = [base];
    const source = createManualSource({
      list: () => stored,
      setDone: (id, done) => {
        stored = stored.map((r) => (r.id === id ? { ...r, done } : r));
      },
    });
    const [item] = await source.fetch({ from: '2026-11-10', to: '2026-11-25' });
    expect(item!.title).toBe('Call Ana');
    expect(source.remote).toBe(false);

    await source.markDone!(item!);
    expect((await source.fetch({ from: '', to: '' }))[0]!.done).toBe(true);
  });
});
