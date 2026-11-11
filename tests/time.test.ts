import { describe, expect, it } from 'vitest';
import { addDays, atLocalTime, eventTime, isSameDay, startOfNextDay, toLocalDate } from '../src/main/scheduler/time';
import { at, iso, meeting, task } from './helpers';

describe('time helpers', () => {
  it('builds a local time from a date and HH:mm', () => {
    expect(atLocalTime('2026-11-11', '09:00')).toBe(at(9));
    expect(atLocalTime('2026-11-11', '17:45')).toBe(at(17, 45));
  });

  it('keeps a date-only value on its local day, not UTC', () => {
    // If this were parsed as UTC it would land on Nov 10 in US time zones.
    expect(toLocalDate(atLocalTime('2026-11-11', '00:00'))).toBe('2026-11-11');
  });

  it('converts a Notion datetime with an offset to the right instant', () => {
    // 15:00 at UTC-6 is 21:00 UTC, whatever zone the test machine is in.
    const item = meeting({ start: '2026-11-11T15:00:00.000-06:00' });
    expect(eventTime(item, '09:00')).toBe(Date.UTC(2026, 10, 11, 21, 0));
  });

  it('treats a manual datetime without an offset as local time', () => {
    const item = meeting({ source: 'manual', start: '2026-11-11T15:00' });
    expect(eventTime(item, '09:00')).toBe(at(15));
  });

  it('uses the morning time for date-only items', () => {
    expect(eventTime(task({ start: '2026-11-11' }), '09:00')).toBe(at(9));
    expect(eventTime(task({ start: '2026-11-11' }), '07:30')).toBe(at(7, 30));
  });

  it('returns NaN for an unreadable datetime', () => {
    expect(eventTime(meeting({ start: 'not a date' }), '09:00')).toBeNaN();
  });

  it('knows day boundaries', () => {
    expect(isSameDay(at(0, 1), at(23, 59))).toBe(true);
    expect(isSameDay(at(23, 59), at(0, 0, 12))).toBe(false);
    expect(startOfNextDay(at(15))).toBe(at(0, 0, 12));
  });

  it('shifts dates across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('round-trips through iso()', () => {
    expect(Date.parse(iso(at(15)))).toBe(at(15));
  });
});
