import { APIErrorCode, Client, isNotionClientError } from '@notionhq/client';
import { MIN_REQUEST_GAP_MS } from './config';
import { createThrottle, withRetry } from './retry';

/** A Notion page reduced to what the app reads. Properties are parsed in mapping.ts. */
export type NotionPage = { id: string; url?: string; properties: Record<string, unknown> };

/** A child block reduced to what month discovery reads. */
export type NotionBlock = { id: string; type: string; title: string };

/**
 * The few Notion operations the app needs. Sources depend on this interface
 * rather than on the SDK, so tests can pass a fake and the SDK can be
 * upgraded in one file.
 */
export interface NotionApi {
  /** All rows of a data source that match the filter, across every page of results. */
  queryDataSource(dataSourceId: string, filter: Record<string, unknown>): Promise<NotionPage[]>;
  /** Child pages and child databases directly under a page. */
  listChildren(blockId: string): Promise<NotionBlock[]>;
  /** The data source IDs behind a database. */
  dataSourceIds(databaseId: string): Promise<string[]>;
  /** Throws unless the integration can read the data source. */
  checkDataSource(dataSourceId: string): Promise<void>;
  /** Throws unless the token is valid. */
  checkToken(): Promise<void>;
  /** Set a status property on a page. */
  setStatus(pageId: string, property: string, value: string): Promise<void>;
}

/**
 * Wrap the official SDK. The SDK version decides the Notion-Version header
 * (2025-09-03 for SDK 5.x, where rows are queried through data sources).
 */
export function createNotionApi(token: string): NotionApi {
  // Retries are handled here, by withRetry, so the SDK's own are turned off.
  const notion = new Client({ auth: token, retry: false, timeoutMs: 20_000 });
  const throttle = createThrottle(MIN_REQUEST_GAP_MS);
  /** Every request goes through the rate limiter, then retry with backoff. */
  const call = <T>(fn: () => Promise<T>) => withRetry(() => throttle(fn));

  return {
    async queryDataSource(dataSourceId, filter) {
      const pages: NotionPage[] = [];
      let cursor: string | undefined;
      do {
        const res = await call(() =>
          notion.dataSources.query({
            data_source_id: dataSourceId,
            filter: filter as never,
            start_cursor: cursor,
            page_size: 100,
          }),
        );
        for (const row of res.results) {
          // Rows are pages. Partial objects (no properties) are skipped.
          if (row.object === 'page' && 'properties' in row) {
            pages.push({ id: row.id, url: row.url, properties: row.properties });
          }
        }
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
      } while (cursor);
      return pages;
    },

    async listChildren(blockId) {
      const blocks: NotionBlock[] = [];
      let cursor: string | undefined;
      do {
        const res = await call(() =>
          notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 }),
        );
        for (const block of res.results) {
          if (!('type' in block)) continue;
          if (block.type === 'child_page') {
            blocks.push({ id: block.id, type: block.type, title: block.child_page.title });
          } else if (block.type === 'child_database') {
            blocks.push({ id: block.id, type: block.type, title: block.child_database.title });
          }
        }
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
      } while (cursor);
      return blocks;
    },

    async dataSourceIds(databaseId) {
      const db = await call(() => notion.databases.retrieve({ database_id: databaseId }));
      return 'data_sources' in db ? db.data_sources.map((d) => d.id) : [];
    },

    async checkDataSource(dataSourceId) {
      await call(() => notion.dataSources.retrieve({ data_source_id: dataSourceId }));
    },

    async checkToken() {
      await call(() => notion.users.me({}));
    },

    async setStatus(pageId, property, value) {
      await call(() =>
        notion.pages.update({ page_id: pageId, properties: { [property]: { status: { name: value } } } }),
      );
    },
  };
}

/**
 * A short, plain message for a failed Notion call. Shown in the footer, the
 * popup, and Test connection. Never includes the token.
 */
export function describeNotionError(error: unknown): string {
  if (isNotionClientError(error)) {
    switch (error.code) {
      case APIErrorCode.Unauthorized:
        return 'Notion rejected the token. Check it in Settings.';
      case APIErrorCode.RestrictedResource:
        return 'The integration is not allowed to do this. Check its capabilities in Notion.';
      case APIErrorCode.ObjectNotFound:
        return 'Not found. Share the page or database with the integration in Notion.';
      case APIErrorCode.RateLimited:
        return 'Notion is rate limiting requests. It will try again on the next sync.';
      case 'notionhq_client_request_timeout':
        return 'Notion took too long to answer.';
      default:
        return `Notion error: ${error.message}`;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  // fetch() reports DNS and connection failures with these.
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(message)) {
    return 'Cannot reach Notion. Check your internet connection.';
  }
  return message;
}
