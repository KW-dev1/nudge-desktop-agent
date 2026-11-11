import { describe, expect, it } from 'vitest';
import { formatDuration, headlineFor } from '../src/shared/headline';
import { at } from './helpers';

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(1)).toBe('1 minute');
    expect(formatDuration(30)).toBe('30 minutes');
    expect(formatDuration(60)).toBe('1 hour');
    expect(formatDuration(75)).toBe('1 hour 15 minutes');
    expect(formatDuration(120)).toBe('2 hours');
  });
});

describe('meeting headlines', () => {
  const m = { kind: 'meeting' as const, hasTime: true, eventAt: at(15) };

  it('uses the spec wording at the default lead times', () => {
    expect(headlineFor(m, at(14, 30))).toBe('Meeting in 30 minutes');
    expect(headlineFor(m, at(14))).toBe('Meeting in 1 hour');
  });

  it('reflects the real time left when the alert fires late', () => {
    expect(headlineFor(m, at(14, 18))).toBe('Meeting in 42 minutes');
  });

  it('absorbs the few seconds a scheduler tick can be late', () => {
    expect(headlineFor(m, at(14, 30) + 14_000)).toBe('Meeting in 30 minutes');
  });

  it('says "today" for a meeting with no time', () => {
    expect(headlineFor({ kind: 'meeting', hasTime: false, eventAt: at(9) }, at(11))).toBe('Meeting today');
  });

  it('handles the start and just after it', () => {
    expect(headlineFor(m, at(15))).toBe('Meeting starting now');
    expect(headlineFor(m, at(15, 10))).toBe('Meeting started 10 minutes ago');
  });
});

describe('task and follow-up headlines', () => {
  it('says due now at the due time', () => {
    expect(headlineFor({ kind: 'task', hasTime: true, eventAt: at(16) }, at(16))).toBe('Task due now');
  });

  it('says how overdue a timed task is', () => {
    expect(headlineFor({ kind: 'task', hasTime: true, eventAt: at(16) }, at(18, 5))).toBe(
      'Task overdue by 2 hours 5 minutes',
    );
  });

  it('says due today for a date-only task on its day', () => {
    expect(headlineFor({ kind: 'task', hasTime: false, eventAt: at(9) }, at(13))).toBe('Task due today');
  });

  it('says overdue for a date-only task from yesterday', () => {
    expect(headlineFor({ kind: 'task', hasTime: false, eventAt: at(9, 0, 10) }, at(8))).toBe('Task overdue');
  });

  it('labels follow-ups', () => {
    expect(headlineFor({ kind: 'follow-up', hasTime: false, eventAt: at(9) }, at(9))).toBe('Follow-up due today');
  });
});
