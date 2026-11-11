import Store from 'electron-store';
import { normalizeSettings } from '../../shared/settings';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types';

// settings.json in the app data folder. The Notion token is NOT kept here;
// see token.ts.
const store = new Store<{ settings: Settings }>({
  name: 'settings',
  defaults: { settings: DEFAULT_SETTINGS },
});

/** Current settings. Always valid, even if the file was edited by hand. */
export function getSettings(): Settings {
  return normalizeSettings(store.get('settings'));
}

/** Apply a partial change, validate it, save, and return the result. */
export function updateSettings(patch: unknown): Settings {
  const current = getSettings();
  const p = (patch ?? {}) as Partial<Settings>;
  const next = normalizeSettings(
    { ...current, ...p, appearance: { ...current.appearance, ...(p.appearance ?? {}) } },
    current,
  );
  store.set('settings', next);
  return next;
}
