// Every Notion ID and property name the app depends on lives in this file.
// If a column is renamed in Notion, the fix is one line here.

/** The Meetings database. Both IDs are kept: newer API versions query by data source. */
export const MEETINGS = {
  databaseId: '37abbf26d2a7424db8368472a9e4f629',
  dataSourceId: '2e84d4ad-4662-46b8-989c-827ff3bd6736',
  props: {
    title: 'Meeting',
    date: 'Date',
    client: 'Client',
    with: 'With',
    type: 'Type',
    status: 'Status',
  },
  /** A meeting with this Status is skipped. */
  doneStatus: 'Done',
  /** A meeting with this Status gets a follow-up reminder the next day. */
  followUpStatus: 'Follow-up needed',
} as const;

/**
 * The Todo List page. It holds one child page per month titled YYYY-MM, and
 * each month page holds one inline database of tasks. The monthly database
 * IDs are found at runtime (see months.ts), never hard-coded.
 */
export const TODO_LIST = {
  pageId: '407676ec4d5b81a7977cc379d80a83bd',
  props: {
    title: 'Task',
    due: 'Due',
    client: 'Client',
    priority: 'Priority',
    status: 'Status',
    notes: 'Notes',
  },
  /** Status value that means finished, and the value Mark done writes. */
  doneStatus: 'Done',
} as const;

/** Notion allows about 3 requests per second. Stay a little under it. */
export const MIN_REQUEST_GAP_MS = 350;
