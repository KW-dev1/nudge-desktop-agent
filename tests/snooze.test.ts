import { describe, expect, it } from 'vitest';
import { EMPTY_STATE, dismissAlert, runTick, snoozeAlert } from '../src/main/scheduler/tick';
import { CONFIG, at, iso, meeting, task } from './helpers';

/** Fire the first alert for the items at `now` and return it with the state. */
function fire(items: Parameters<typeof runTick>[1], now: number) {
  const result = runTick(now, items, EMPTY_STATE, CONFIG);
  expect(result.show).toHaveLength(1);
  return { alert: result.show[0]!, state: result.state };
}

describe('snooze (5.4)', () => {
  it('brings the same alert back after the snooze length (acceptance)', () => {
    const items = [task()];
    const { alert, state } = fire(items, at(9));
    const snoozed = snoozeAlert(state, alert.key, 10, at(9, 1));

    // Nothing for the next ten minutes.
    expect(runTick(at(9, 10), items, snoozed, CONFIG).show).toEqual([]);

    const back = runTick(at(9, 11), items, snoozed, CONFIG);
    expect(back.show.map((a) => a.key)).toEqual([alert.key]);
    // And it is consumed: it does not fire a third time.
    expect(runTick(at(9, 12), items, back.state, CONFIG).show).toEqual([]);
    expect(back.state.snoozes).toEqual([]);
  });

  it('survives a restart because the snooze is part of the saved state (acceptance)', () => {
    const items = [task()];
    const { alert, state } = fire(items, at(9));
    const saved = JSON.parse(JSON.stringify(snoozeAlert(state, alert.key, 10, at(9))));
    expect(runTick(at(9, 10), items, saved, CONFIG).show.map((a) => a.key)).toEqual([alert.key]);
  });

  it('updates the headline to the real time left when it comes back', () => {
    const items = [meeting()];
    const { alert, state } = fire(items, at(14));
    const snoozed = snoozeAlert(state, alert.key, 10, at(14, 2));
    expect(runTick(at(14, 12), items, snoozed, CONFIG).show[0]!.headline).toBe('Meeting in 48 minutes');
  });

  it('can be snoozed again', () => {
    const items = [task()];
    const { alert, state } = fire(items, at(9));
    let s = snoozeAlert(state, alert.key, 5, at(9));
    s = runTick(at(9, 5), items, s, CONFIG).state;
    s = snoozeAlert(s, alert.key, 30, at(9, 5));
    expect(s.snoozes).toHaveLength(1);
    expect(runTick(at(9, 34), items, s, CONFIG).show).toEqual([]);
    expect(runTick(at(9, 35), items, s, CONFIG).show).toHaveLength(1);
  });

  it('still returns a snoozed meeting alert up to 15 minutes after the start', () => {
    const items = [meeting()];
    const { alert, state } = fire(items, at(14, 55));
    const snoozed = snoozeAlert(state, alert.key, 10, at(14, 58));
    const back = runTick(at(15, 8), items, snoozed, CONFIG);
    expect(back.show.map((a) => a.headline)).toEqual(['Meeting started 8 minutes ago']);
  });

  it('drops a snoozed meeting alert once the start has passed by 15 minutes', () => {
    const items = [meeting()];
    const { alert, state } = fire(items, at(14, 55));
    const snoozed = snoozeAlert(state, alert.key, 30, at(14, 58));
    const later = runTick(at(15, 28), items, snoozed, CONFIG);
    expect(later.show).toEqual([]);
    expect(later.state.snoozes).toEqual([]);
  });

  it('keeps a snoozed task alive however late it gets', () => {
    const items = [task({ start: iso(at(10)), hasTime: true })];
    const { alert, state } = fire(items, at(10));
    const snoozed = snoozeAlert(state, alert.key, 60, at(10));
    expect(runTick(at(11), items, snoozed, CONFIG).show).toHaveLength(1);
  });

  it('drops the snooze when the item is marked done', () => {
    const { alert, state } = fire([task()], at(9));
    const snoozed = snoozeAlert(state, alert.key, 10, at(9));
    const later = runTick(at(9, 10), [task({ done: true })], snoozed, CONFIG);
    expect(later.show).toEqual([]);
    expect(later.state.snoozes).toEqual([]);
  });

  it('drops the snooze when the item is deleted', () => {
    const { alert, state } = fire([task()], at(9));
    const snoozed = snoozeAlert(state, alert.key, 10, at(9));
    expect(runTick(at(9, 10), [], snoozed, CONFIG).state.snoozes).toEqual([]);
  });

  it('shows one popup when a snooze ends as the next lead time arrives', () => {
    const items = [meeting()];
    const { alert, state } = fire(items, at(14, 25));
    // Snoozed for 5 minutes: due back at 14:30, exactly when lead-30 fires.
    const snoozed = snoozeAlert(state, alert.key, 5, at(14, 25));
    const result = runTick(at(14, 30), items, snoozed, CONFIG);
    expect(result.show).toHaveLength(1);
    expect(result.show[0]!.alertKind).toBe('lead-30');
    expect(result.state.snoozes).toEqual([]);
  });
});

describe('dismiss', () => {
  it('cancels a pending snooze and never shows the alert again', () => {
    const items = [task()];
    const { alert, state } = fire(items, at(9));
    const dismissed = dismissAlert(snoozeAlert(state, alert.key, 10, at(9)), alert.key, at(9, 1));
    expect(dismissed.snoozes).toEqual([]);
    expect(runTick(at(9, 30), items, dismissed, CONFIG).show).toEqual([]);
  });
});
