import { describe, expect, it } from 'vitest';
import { EMPTY_STATE, pruneFired, runTick, type SchedulerState } from '../src/main/scheduler/tick';
import { DAY } from '../src/main/scheduler/time';
import type { ReminderItem } from '../src/shared/types';
import { CONFIG, at, iso, meeting, task } from './helpers';

/**
 * Drives the scheduler the way the app does: tick repeatedly, carrying the
 * state forward. Returns every headline shown, in order.
 */
function run(items: ReminderItem[], times: number[], state: SchedulerState = EMPTY_STATE) {
  const shown: string[] = [];
  for (const now of times) {
    const result = runTick(now, items, state, CONFIG);
    state = result.state;
    shown.push(...result.show.map((a) => a.headline));
  }
  return { shown, state };
}

/** Every 15 seconds from `from` to `to`, like the real scheduler. */
function every15s(from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = from; t <= to; t += 15_000) out.push(t);
  return out;
}

describe('meeting alerts', () => {
  it('shows nothing before the first lead time', () => {
    expect(run([meeting()], [at(13, 59)]).shown).toEqual([]);
  });

  it('fires at 60 and again at 30 minutes (acceptance: meeting 61 minutes ahead)', () => {
    const { shown } = run([meeting()], every15s(at(13, 59), at(15, 5)));
    expect(shown).toEqual(['Meeting in 1 hour', 'Meeting in 30 minutes']);
  });

  it('never fires for a Done meeting (acceptance)', () => {
    expect(run([meeting({ done: true })], every15s(at(13), at(16))).shown).toEqual([]);
  });

  it('fires a date-only meeting once at the morning time', () => {
    const m = meeting({ start: '2026-11-11', hasTime: false });
    const { shown } = run([m], every15s(at(8, 55), at(9, 5)));
    expect(shown).toEqual(['Meeting today']);
  });
});

describe('task and follow-up alerts', () => {
  it('fires a date-only task once at the morning time (acceptance)', () => {
    const { shown } = run([task()], every15s(at(8, 59), at(9, 30)));
    expect(shown).toEqual(['Task due today']);
  });

  it('fires a timed task at its due time', () => {
    const t = task({ start: iso(at(16)), hasTime: true });
    expect(run([t], [at(15, 59)]).shown).toEqual([]);
    expect(run([t], [at(16)]).shown).toEqual(['Task due now']);
  });

  it('never fires for a done task', () => {
    expect(run([task({ done: true })], [at(9), at(10)]).shown).toEqual([]);
  });

  it('fires a follow-up item at the morning time on its day', () => {
    const f = task({ id: 'm1:follow-up', source: 'notion-meeting', kind: 'follow-up', start: '2026-11-12' });
    expect(run([f], [at(23, 0)]).shown).toEqual([]);
    expect(run([f], [at(9, 0, 12)]).shown).toEqual(['Follow-up due today']);
  });
});

describe('restarts and repeats (5.3)', () => {
  it('does not show an alert again after a restart (acceptance)', () => {
    const first = run([meeting()], [at(14)]);
    expect(first.shown).toEqual(['Meeting in 1 hour']);
    // A restart keeps only the persisted state.
    const second = run([meeting()], [at(14, 1)], first.state);
    expect(second.shown).toEqual([]);
  });

  it('reports whether the state needs saving', () => {
    const idle = runTick(at(12), [meeting()], EMPTY_STATE, CONFIG);
    expect(idle.changed).toBe(false);
    expect(idle.state).toBe(EMPTY_STATE);
    expect(runTick(at(14), [meeting()], EMPTY_STATE, CONFIG).changed).toBe(true);
  });

  it('fires again when the meeting time changes in Notion', () => {
    const first = run([meeting()], [at(14)]);
    // Moved from 15:00 to 15:30, now 60 minutes before the new time.
    const moved = meeting({ start: iso(at(15, 30)) });
    const second = run([moved], [at(14, 30)], first.state);
    expect(second.shown).toEqual(['Meeting in 1 hour']);
  });
});

describe('missed alerts (5.3)', () => {
  it('shows one popup with the real time left when started late (acceptance: 40 minutes before)', () => {
    const { shown } = run([meeting()], [at(14, 20)]);
    expect(shown).toEqual(['Meeting in 40 minutes']);
  });

  it('merges both lead alerts when both are overdue, then stays quiet', () => {
    const { shown } = run([meeting()], every15s(at(14, 42), at(15, 10)));
    expect(shown).toEqual(['Meeting in 18 minutes']);
  });

  it('still fires the 30 minute alert after a late 60 minute one', () => {
    const { shown } = run([meeting()], [at(14, 20), at(14, 30)]);
    expect(shown).toEqual(['Meeting in 40 minutes', 'Meeting in 30 minutes']);
  });

  it('skips meeting alerts once the meeting has started', () => {
    const { shown, state } = run([meeting()], [at(15, 5)]);
    expect(shown).toEqual([]);
    // Both are remembered as fired so they are never reconsidered.
    expect(Object.keys(state.fired)).toHaveLength(2);
  });

  it('shows a date-only meeting later the same day, but not the next day', () => {
    const m = meeting({ start: '2026-11-11', hasTime: false });
    expect(run([m], [at(14)]).shown).toEqual(['Meeting today']);
    expect(run([m], [at(8, 0, 12)]).shown).toEqual([]);
  });

  it('fires a task that came due while closed, if under 24 hours overdue', () => {
    const t = task({ start: iso(at(16)), hasTime: true });
    expect(run([t], [at(19, 30)]).shown).toEqual(['Task overdue by 3 hours 30 minutes']);
  });

  it('marks a task overdue by 24 hours or more as fired without a popup', () => {
    const t = task({ start: iso(at(16, 0, 10)), hasTime: true });
    const { shown, state } = run([t], [at(16, 0, 11)]);
    expect(shown).toEqual([]);
    expect(Object.keys(state.fired)).toHaveLength(1);
  });

  it('fires a date-only task from yesterday as overdue', () => {
    const t = task({ start: '2026-11-10' });
    expect(run([t], [at(8)]).shown).toEqual(['Task overdue']);
  });
});

describe('several items at once', () => {
  it('returns one alert per item, earliest event first', () => {
    const items = [
      task({ id: 'b', title: 'B' }),
      meeting({ id: 'a', start: '2026-11-11', hasTime: false }),
      task({ id: 'c', title: 'C', source: 'manual' }),
    ];
    const result = runTick(at(9), items, EMPTY_STATE, CONFIG);
    expect(result.show).toHaveLength(3);
    expect(new Set(result.show.map((a) => a.item.id))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('carries the item and event time on each fired alert', () => {
    const [alert] = runTick(at(14, 30), [meeting()], EMPTY_STATE, CONFIG).show;
    expect(alert!.item.title).toBe('Discovery call');
    expect(alert!.eventAt).toBe(at(15));
    expect(alert!.alertKind).toBe('lead-30');
    expect(alert!.firedAt).toBe(at(14, 30));
  });
});

describe('fired key cleanup (5.3)', () => {
  it('drops keys older than 30 days and keeps newer ones', () => {
    const now = at(12);
    const state: SchedulerState = {
      fired: { old: now - 31 * DAY, recent: now - 29 * DAY },
      snoozes: [],
    };
    expect(pruneFired(state, now).fired).toEqual({ recent: now - 29 * DAY });
  });

  it('returns the same object when nothing is old', () => {
    const state: SchedulerState = { fired: { a: at(11) }, snoozes: [] };
    expect(pruneFired(state, at(12))).toBe(state);
  });

  it('keeps the key of a pending snooze however old it is', () => {
    const now = at(12);
    const state: SchedulerState = { fired: { k: now - 40 * DAY }, snoozes: [{ key: 'k', until: now + 1 }] };
    expect(pruneFired(state, now).fired).toHaveProperty('k');
  });
});
