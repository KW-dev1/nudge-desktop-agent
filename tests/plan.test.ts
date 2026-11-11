import { describe, expect, it } from 'vitest';
import { planAlerts, planItem } from '../src/main/scheduler/plan';
import { CONFIG, at, iso, meeting, task } from './helpers';

describe('planning meeting alerts (5.1)', () => {
  it('plans one alert per lead time before the start', () => {
    const alerts = planItem(meeting(), CONFIG);
    expect(alerts.map((a) => a.alertKind)).toEqual(['lead-60', 'lead-30']);
    expect(alerts.map((a) => a.fireAt)).toEqual([at(14), at(14, 30)]);
    expect(alerts.every((a) => a.eventAt === at(15))).toBe(true);
  });

  it('follows custom lead times and ignores duplicates', () => {
    const alerts = planItem(meeting(), { ...CONFIG, leadTimes: [15, 15, 5] });
    expect(alerts.map((a) => a.fireAt)).toEqual([at(14, 45), at(14, 55)]);
  });

  it('skips meetings that are Done', () => {
    expect(planItem(meeting({ done: true }), CONFIG)).toEqual([]);
  });

  it('gives a date-only meeting one alert at the morning time', () => {
    const alerts = planItem(meeting({ start: '2026-11-11', hasTime: false }), CONFIG);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.alertKind).toBe('day');
    expect(alerts[0]!.fireAt).toBe(at(9));
  });
});

describe('planning task and follow-up alerts (5.2)', () => {
  it('fires a timed task at its due time', () => {
    const alerts = planItem(task({ start: iso(at(16, 30)), hasTime: true }), CONFIG);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.alertKind).toBe('due');
    expect(alerts[0]!.fireAt).toBe(at(16, 30));
  });

  it('fires a date-only task at the morning time', () => {
    expect(planItem(task(), CONFIG)[0]!.fireAt).toBe(at(9));
    expect(planItem(task(), { ...CONFIG, morningTime: '08:15' })[0]!.fireAt).toBe(at(8, 15));
  });

  it('skips items that are done', () => {
    expect(planItem(task({ done: true }), CONFIG)).toEqual([]);
  });

  it('plans a follow-up the same way as a task', () => {
    const alerts = planItem(task({ kind: 'follow-up', start: '2026-11-12' }), CONFIG);
    expect(alerts[0]!.fireAt).toBe(at(9, 0, 12));
  });
});

describe('alert keys (5.3)', () => {
  it('is stable for the same item and time', () => {
    expect(planItem(meeting(), CONFIG)[0]!.key).toBe(planItem(meeting(), CONFIG)[0]!.key);
  });

  it('includes source, item ID, alert kind, and scheduled time', () => {
    const key = planItem(meeting(), CONFIG)[0]!.key;
    expect(key).toBe(`notion-meeting|m1|lead-60|${iso(at(15))}`);
  });

  it('changes when the item time changes, so the alert can fire again', () => {
    const before = planItem(meeting(), CONFIG).map((a) => a.key);
    const after = planItem(meeting({ start: iso(at(16)) }), CONFIG).map((a) => a.key);
    expect(after).not.toEqual(before);
  });

  it('does not change for date-only items when the morning time setting changes', () => {
    const a = planItem(task(), CONFIG)[0]!.key;
    const b = planItem(task(), { ...CONFIG, morningTime: '07:00' })[0]!.key;
    expect(a).toBe(b);
  });

  it('keeps items from different sources apart even with the same ID', () => {
    const keys = planAlerts([task({ id: 'x' }), task({ id: 'x', source: 'manual' })], CONFIG).map((a) => a.key);
    expect(new Set(keys).size).toBe(2);
  });

  it('skips items with unreadable dates instead of throwing', () => {
    expect(planAlerts([meeting({ start: 'garbage' })], CONFIG)).toEqual([]);
  });
});
