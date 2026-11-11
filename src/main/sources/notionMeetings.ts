import type { NotionApi } from '../notion/client';
import { MEETINGS } from '../notion/config';
import { dateRangeFilter, meetingItems } from '../notion/mapping';
import type { ReminderSourceAdapter } from './types';

/**
 * Meetings from the Notion Meetings database. Read-only: the app never
 * edits a meeting, so there is no markDone here.
 *
 * `getApi` is called on every fetch so a token saved a moment ago is used
 * without restarting. It throws when no token is set.
 */
export function createNotionMeetingsSource(getApi: () => NotionApi): ReminderSourceAdapter {
  return {
    id: 'notion-meeting',
    label: 'Meetings',
    remote: true,
    async fetch(range) {
      const pages = await getApi().queryDataSource(
        MEETINGS.dataSourceId,
        dateRangeFilter(MEETINGS.props.date, range.from, range.to),
      );
      return pages.flatMap(meetingItems);
    },
  };
}
