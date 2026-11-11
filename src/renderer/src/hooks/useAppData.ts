import { useCallback, useEffect, useRef, useState } from 'react';
import type { SettingsPatch } from '../../../preload/index';
import type { ManualReminder, ReminderItem, Settings, SyncStatus } from '../../../shared/types';

const api = window.nudge;

export type AppData = {
  settings: Settings;
  items: ReminderItem[];
  reminders: ManualReminder[];
  sync: SyncStatus;
  /** Current time, refreshed every 30 seconds so lists regroup as time passes. */
  now: number;
  updateSettings: (patch: SettingsPatch) => void;
  syncNow: () => Promise<void>;
};

/**
 * Loads everything the main window shows and keeps it fresh. The main
 * process sends "data:changed" after any sync, reminder edit, or settings
 * change, and this hook reloads in response.
 */
export function useAppData(): AppData | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [reminders, setReminders] = useState<ManualReminder[]>([]);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Settings edits are applied to the screen at once and sent to main after
  // a short pause, so dragging a slider does not write the file 60 times a
  // second.
  const pending = useRef<SettingsPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const [nextItems, nextReminders, nextSync] = await Promise.all([
      api.items.list(),
      api.reminders.list(),
      api.sync.status(),
    ]);
    setItems(nextItems);
    setReminders(nextReminders);
    setSync(nextSync);
  }, []);

  useEffect(() => {
    void api.settings.get().then(setSettings);
    void reload();
    const off = api.items.onChanged(() => void reload());
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      off();
      clearInterval(clock);
    };
  }, [reload]);

  const updateSettings = useCallback((patch: SettingsPatch) => {
    setSettings((current) =>
      current ? { ...current, ...patch, appearance: { ...current.appearance, ...(patch.appearance ?? {}) } } : current,
    );
    pending.current = {
      ...pending.current,
      ...patch,
      appearance: { ...(pending.current.appearance ?? {}), ...(patch.appearance ?? {}) },
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const toSend = pending.current;
      pending.current = {};
      // Main validates the patch and returns what was actually saved.
      void api.settings.update(toSend).then((saved) => {
        // Skip the echo if the user has already changed something else.
        if (Object.keys(pending.current).length === 0) setSettings(saved);
      });
    }, 150);
  }, []);

  const syncNow = useCallback(async () => {
    setSync((s) => (s ? { ...s, syncing: true } : s));
    setSync(await api.sync.now());
  }, []);

  if (!settings || !sync) return null;
  return { settings, items, reminders, sync, now, updateSettings, syncNow };
}
