import { describe, expect, it, vi } from 'vitest';
import type { NotionApi } from '../src/main/notion/client';
import { MEETINGS } from '../src/main/notion/config';
import { meetingItems } from '../src/main/notion/mapping';
import { toLocalDate, addDays } from '../src/main/scheduler/time';
import { createNotionMeetingsSource } from '../src/main/sources/notionMeetings';
import { date, meetingPage, richText, select, title } from './notionFixtures';

describe('mapping a Meetings row (section 4.1)', () => {
  it('maps every property', () => {
    expect(meetingItems(meetingPage())).toEqual([
      {
        id: 'meet-1',
        source: 'notion-meeting',
        kind: 'meeting',
        title: 'Discovery call',
        start: '2026-11-12T15:00:00.000-06:00',
        hasTime: true,
        done: false,
        client: 'Ana',
        with: 'Ana and John',
        type: 'Discovery call',
        url: 'https://www.notion.so/meet-1',
      },
    ]);
  });

  it('detects a date with no time', () => {
    const [item] = meetingItems(meetingPage({ Date: date('2026-11-12') }));
    expect(item).toMatchObject({ start: '2026-11-12', hasTime: false });
  });

  it('marks Status Done as done, so the scheduler skips it', () => {
    expect(meetingItems(meetingPage({ Status: select('Done') }))[0]!.done).toBe(true);
  });

  it('leaves empty properties undefined so the popup hides them', () => {
    const [item] = meetingItems(meetingPage({ Client: select(null), With: richText(''), Type: select(null) }));
    expect(item!.client).toBeUndefined();
    expect(item!.with).toBeUndefined();
    expect(item!.type).toBeUndefined();
  });

  it('skips a row with no date', () => {
    expect(meetingItems(meetingPage({ Date: date(null) }))).toEqual([]);
  });

  it('survives a missing or renamed column', () => {
    const page = meetingPage();
    delete page.properties['Client'];
    delete page.properties['Meeting'];
    const [item] = meetingItems(page);
    expect(item!.title).toBe('');
    expect(item!.client).toBeUndefined();
  });
});

describe('Follow-up needed (section 5.2)', () => {
  it('adds a follow-up reminder for the day after a date-only meeting', () => {
    const items = meetingItems(meetingPage({ Status: select('Follow-up needed'), Date: date('2026-11-12') }));
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      id: 'meet-1:follow-up',
      source: 'notion-meeting',
      kind: 'follow-up',
      title: 'Follow up: Discovery call',
      start: '2026-11-13',
      hasTime: false,
      done: false,
      client: 'Ana',
      url: 'https://www.notion.so/meet-1',
    });
  });

  it('counts the next day from the local date of a timed meeting', () => {
    const start = '2026-11-12T15:00:00.000-06:00';
    const items = meetingItems(meetingPage({ Status: select('Follow-up needed') }));
    expect(items[1]!.start).toBe(addDays(toLocalDate(Date.parse(start)), 1));
  });

  it('does not add one for other statuses', () => {
    expect(meetingItems(meetingPage({ Status: select('Prep') }))).toHaveLength(1);
    expect(meetingItems(meetingPage({ Status: select('Done') }))).toHaveLength(1);
  });

  it('still names the follow-up when the meeting has no title', () => {
    const items = meetingItems(meetingPage({ Status: select('Follow-up needed'), Meeting: title('') }));
    expect(items[1]!.title).toBe('Follow up on meeting');
  });
});

describe('Notion meetings source', () => {
  it('queries the Meetings data source for the date window', async () => {
    const queryDataSource = vi.fn(async () => [meetingPage(), meetingPage({ Status: select('Follow-up needed') }, 'meet-2')]);
    const source = createNotionMeetingsSource(() => ({ queryDataSource }) as unknown as NotionApi);

    const items = await source.fetch({ from: '2026-11-10', to: '2026-11-25' });

    expect(queryDataSource).toHaveBeenCalledWith(MEETINGS.dataSourceId, {
      and: [
        { property: 'Date', date: { on_or_after: '2026-11-10' } },
        { property: 'Date', date: { on_or_before: '2026-11-25' } },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(['meet-1', 'meet-2', 'meet-2:follow-up']);
  });

  it('is read-only: meetings cannot be marked done', () => {
    const source = createNotionMeetingsSource(() => ({}) as NotionApi);
    expect(source.markDone).toBeUndefined();
    expect(source.remote).toBe(true);
  });

  it('passes on the error when there is no token', async () => {
    const source = createNotionMeetingsSource(() => {
      throw new Error('No Notion token saved.');
    });
    await expect(source.fetch({ from: 'a', to: 'b' })).rejects.toThrow('No Notion token');
  });
});
