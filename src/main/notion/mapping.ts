// Turns raw Notion pages into ReminderItems. Pure functions. Property values
// are read defensively: a missing or retyped column gives an empty field,
// never a crash.

import type { ReminderItem } from '../../shared/types';
import { addDays, toLocalDate } from '../scheduler/time';
import type { NotionPage } from './client';
import { MEETINGS, TODO_LIST } from './config';

type Prop = Record<string, unknown> | undefined;

function prop(page: NotionPage, name: string): Prop {
  const value = page.properties[name];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/** Join the plain text of a title or rich text property. */
function text(p: Prop, key: 'title' | 'rich_text'): string {
  const parts = p?.[key];
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => (part as { plain_text?: unknown }).plain_text)
    .filter((s): s is string => typeof s === 'string')
    .join('')
    .trim();
}

/** The option name of a select or status property. */
function option(p: Prop, key: 'select' | 'status'): string | undefined {
  const name = (p?.[key] as { name?: unknown } | null | undefined)?.name;
  return typeof name === 'string' && name ? name : undefined;
}

/**
 * The start of a date property. Notion sends "2026-11-12" for a date and
 * "2026-11-12T15:00:00.000-06:00" for a date with a time.
 */
function dateStart(p: Prop): { start: string; hasTime: boolean } | null {
  const start = (p?.['date'] as { start?: unknown } | null | undefined)?.start;
  if (typeof start !== 'string' || !start) return null;
  return { start, hasTime: start.includes('T') };
}

const orUndefined = (s: string) => (s ? s : undefined);

/**
 * Map a row of the Meetings database. Returns no items when the row has no
 * date, one for a normal meeting, and two when Status is "Follow-up needed":
 * the meeting itself plus a follow-up reminder for the next day.
 */
export function meetingItems(page: NotionPage): ReminderItem[] {
  const P = MEETINGS.props;
  const date = dateStart(prop(page, P.date));
  if (!date) return [];

  const status = option(prop(page, P.status), 'select');
  const title = text(prop(page, P.title), 'title');
  const shared = {
    client: option(prop(page, P.client), 'select'),
    with: orUndefined(text(prop(page, P.with), 'rich_text')),
    type: option(prop(page, P.type), 'select'),
    url: page.url,
  };

  const meeting: ReminderItem = {
    id: page.id,
    source: 'notion-meeting',
    kind: 'meeting',
    title,
    start: date.start,
    hasTime: date.hasTime,
    done: status === MEETINGS.doneStatus,
    ...shared,
  };
  if (status !== MEETINGS.followUpStatus) return [meeting];

  // The day after the meeting, counted in local time. A meeting at 11 PM
  // Central is stored with an offset; its local day is what matters.
  const meetingDay = date.hasTime ? toLocalDate(Date.parse(date.start)) : date.start.slice(0, 10);
  const followUp: ReminderItem = {
    // A distinct ID so its alert key never collides with the meeting's.
    id: `${page.id}:follow-up`,
    source: 'notion-meeting',
    kind: 'follow-up',
    title: title ? `Follow up: ${title}` : 'Follow up on meeting',
    start: addDays(meetingDay, 1),
    hasTime: false,
    done: false,
    ...shared,
  };
  return [meeting, followUp];
}

/** Map a row of a monthly task table. Returns null when it has no due date. */
export function taskItem(page: NotionPage): ReminderItem | null {
  const P = TODO_LIST.props;
  const due = dateStart(prop(page, P.due));
  if (!due) return null;
  return {
    id: page.id,
    source: 'notion-task',
    kind: 'task',
    title: text(prop(page, P.title), 'title'),
    start: due.start,
    hasTime: due.hasTime,
    done: option(prop(page, P.status), 'status') === TODO_LIST.doneStatus,
    client: option(prop(page, P.client), 'select'),
    priority: option(prop(page, P.priority), 'select'),
    notes: orUndefined(text(prop(page, P.notes), 'rich_text')),
    url: page.url,
  };
}

/** Notion filter: the date property falls inside the range, both ends included. */
export function dateRangeFilter(property: string, from: string, to: string): Record<string, unknown> {
  return {
    and: [
      { property, date: { on_or_after: from } },
      { property, date: { on_or_before: to } },
    ],
  };
}
