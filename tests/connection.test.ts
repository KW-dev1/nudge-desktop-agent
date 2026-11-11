import { describe, expect, it, vi } from 'vitest';
import type { NotionApi } from '../src/main/notion/client';
import { MEETINGS, TODO_LIST } from '../src/main/notion/config';
import { testConnection } from '../src/main/notion/connection';

function api(overrides: Partial<Record<keyof NotionApi, unknown>> = {}): NotionApi {
  return {
    checkToken: vi.fn(async () => {}),
    checkDataSource: vi.fn(async () => {}),
    listChildren: vi.fn(async () => []),
    ...overrides,
  } as unknown as NotionApi;
}

describe('Test connection (section 9)', () => {
  it('reports both sources readable', async () => {
    const fake = api();
    const result = await testConnection(() => fake);
    expect(result).toEqual({
      ok: true,
      sources: [
        { label: 'Meetings', ok: true },
        { label: 'Todo List', ok: true },
      ],
    });
    expect(fake.checkDataSource).toHaveBeenCalledWith(MEETINGS.dataSourceId);
    expect(fake.listChildren).toHaveBeenCalledWith(TODO_LIST.pageId);
  });

  it('says which source cannot be read', async () => {
    const fake = api({ listChildren: vi.fn(async () => Promise.reject(new Error('fetch failed'))) });
    const result = await testConnection(() => fake);
    expect(result.ok).toBe(false);
    expect(result.sources[0]).toEqual({ label: 'Meetings', ok: true });
    expect(result.sources[1]).toMatchObject({ label: 'Todo List', ok: false, error: expect.stringMatching(/reach Notion/) });
  });

  it('stops early when the token is rejected', async () => {
    const fake = api({ checkToken: vi.fn(async () => Promise.reject(new Error('bad token'))) });
    const result = await testConnection(() => fake);
    expect(result).toEqual({ ok: false, error: 'bad token', sources: [] });
    expect(fake.checkDataSource).not.toHaveBeenCalled();
  });

  it('explains when no token is saved', async () => {
    const result = await testConnection(() => {
      throw new Error('Notion is not connected. Add a token in Settings.');
    });
    expect(result.error).toMatch(/not connected/);
  });
});
