import { describe, expect, it } from 'vitest';
import { groupUpcoming } from '../src/shared/upcoming';
import { at, iso, meeting, task } from './helpers';

const names = (groups: ReturnType<typeof groupUpcoming>) =>
  groups.map((g) => `${g.name}: ${g.rows.map((r) => r.item.id).join(',')}`);

describe('Upcoming tab grouping (section 8)', () => {
  it('groups by Today, Tomorrow, and Later, sorted by time', () => {
    const items = [
      meeting({ id: 'later', start: iso(at(10, 0, 20)) }),
      meeting({ id: 'today-late', start: iso(at(17)) }),
      task({ id: 'tomorrow', start: '2026-11-12' }),
      meeting({ id: 'today-early', start: iso(at(15)) }),
    ];
    expect(names(groupUpcoming(items, at(12), '09:00'))).toEqual([
      'Today: today-early,today-late',
      'Tomorrow: tomorrow',
      'Later: later',
    ]);
  });

  it('leaves out done items and meetings that already started', () => {
    const items = [task({ id: 'done', done: true }), meeting({ id: 'past', start: iso(at(10)) })];
    expect(groupUpcoming(items, at(12), '09:00')).toEqual([]);
  });

  it('keeps a date-only task listed all day, placed at the morning time', () => {
    const items = [task({ id: 'all-day' }), meeting({ id: 'afternoon', start: iso(at(15)) })];
    expect(names(groupUpcoming(items, at(14), '09:00'))).toEqual(['Today: all-day,afternoon']);
  });

  it('puts unfinished tasks from earlier days under Overdue', () => {
    const items = [task({ id: 'old', start: '2026-11-10' }), meeting({ id: 'old-meeting', start: '2026-11-10', hasTime: false })];
    expect(names(groupUpcoming(items, at(12), '09:00'))).toEqual(['Overdue: old']);
  });

  it('omits empty groups', () => {
    expect(groupUpcoming([task({ start: '2026-11-12' })], at(12), '09:00').map((g) => g.name)).toEqual(['Tomorrow']);
  });
});
