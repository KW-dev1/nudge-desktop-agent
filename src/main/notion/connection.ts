import type { ConnectionTest } from '../../shared/types';
import { createNotionApi, describeNotionError, type NotionApi } from './client';
import { MEETINGS, TODO_LIST } from './config';

/**
 * Hands out a Notion API client for the saved token. The client is rebuilt
 * when the token changes, so a new token works without a restart.
 */
export function createApiProvider(loadToken: () => string | null): () => NotionApi {
  let cached: { token: string; api: NotionApi } | null = null;
  return () => {
    const token = loadToken();
    if (!token) throw new Error('Notion is not connected. Add a token in Settings.');
    if (!cached || cached.token !== token) cached = { token, api: createNotionApi(token) };
    return cached.api;
  };
}

/**
 * The Test connection button: check the token, then check each of the two
 * sources on its own, so the result says exactly which one is not shared
 * with the integration.
 */
export async function testConnection(getApi: () => NotionApi): Promise<ConnectionTest> {
  let api: NotionApi;
  try {
    api = getApi();
    await api.checkToken();
  } catch (error) {
    return { ok: false, error: describeNotionError(error), sources: [] };
  }

  const check = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run();
      return { label, ok: true };
    } catch (error) {
      return { label, ok: false, error: describeNotionError(error) };
    }
  };

  const sources = [
    await check('Meetings', () => api.checkDataSource(MEETINGS.dataSourceId)),
    await check('Todo List', () => api.listChildren(TODO_LIST.pageId)),
  ];
  return { ok: sources.every((s) => s.ok), sources };
}
