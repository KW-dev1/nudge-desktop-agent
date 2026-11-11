import type { NotionPage } from '../src/main/notion/client';

// Builders for Notion property values, shaped like real API responses.
export const title = (s: string) => ({ type: 'title', title: s ? [{ plain_text: s }] : [] });
export const richText = (s: string) => ({ type: 'rich_text', rich_text: s ? [{ plain_text: s }] : [] });
export const select = (name: string | null) => ({ type: 'select', select: name ? { name } : null });
export const status = (name: string | null) => ({ type: 'status', status: name ? { name } : null });
export const date = (start: string | null) => ({ type: 'date', date: start ? { start, end: null } : null });

export function meetingPage(overrides: Record<string, unknown> = {}, id = 'meet-1'): NotionPage {
  return {
    id,
    url: `https://www.notion.so/${id}`,
    properties: {
      Meeting: title('Discovery call'),
      Date: date('2026-11-12T15:00:00.000-06:00'),
      Client: select('Ana'),
      With: richText('Ana and John'),
      Type: select('Discovery call'),
      Status: select('Prep'),
      ...overrides,
    },
  };
}

export function taskPage(overrides: Record<string, unknown> = {}, id = 'task-1'): NotionPage {
  return {
    id,
    url: `https://www.notion.so/${id}`,
    properties: {
      Task: title('Send proposal'),
      Due: date('2026-11-12'),
      Client: select('John'),
      Priority: select('High'),
      Status: status('To Do'),
      Notes: richText('Use the new template'),
      Week: select('Week 2 (11-09 - 11-15)'),
      ...overrides,
    },
  };
}
