import { BrowserWindow, ipcMain } from 'electron';
import type { ActionResult, ConnectionTest, ManualReminder, ReminderItem, Settings, SyncStatus } from '../shared/types';
import type { AlertService } from './alerts';
import { deleteReminder, listReminders, saveReminder, setReminderDone } from './store/reminders';
import { getSettings, updateSettings } from './store/settings';
import type { SyncService } from './sync';
import { osBlurSupported, popupHidden, popupPayload, popupResized } from './windows/popup';

export type IpcDeps = {
  alerts: AlertService;
  sync: SyncService;
  /** Apply side effects of a settings change (popup look, login item). */
  onSettingsChanged: (settings: Settings) => void;
  notion: {
    /** Encrypt and store the token. Throws with a message for the form. */
    saveToken: (token: string) => void;
    clearToken: () => void;
    test: () => Promise<ConnectionTest>;
  };
};

/** Turn a thrown error into something the renderer can show inline. */
function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' };
}

/** Send an event to every open window (main window and popup). */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  }
}

/**
 * Register every channel the renderer can call. The renderer has no Node
 * access; this file is the full list of what it is allowed to do.
 */
export function registerIpc({ alerts, sync, onSettingsChanged, notion }: IpcDeps): void {
  // --- Popup ---------------------------------------------------------------
  ipcMain.handle('popup:ready', () => popupPayload());
  ipcMain.on('popup:resize', (_event, height: number) => popupResized(height));
  ipcMain.on('popup:hidden', () => popupHidden());
  ipcMain.on('popup:dismiss', (_event, key: string) => alerts.dismiss(String(key)));
  ipcMain.on('popup:snooze', (_event, key: string, minutes: number) => alerts.snooze(String(key), Number(minutes)));
  ipcMain.on('popup:open', (_event, key: string) => alerts.openInNotion(String(key)));
  ipcMain.handle('popup:markDone', async (_event, key: string): Promise<ActionResult> => {
    try {
      await alerts.markDone(String(key));
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.on('popup:sample', () => alerts.showSample());

  // --- Settings ------------------------------------------------------------
  ipcMain.handle('settings:get', (): Settings => getSettings());
  ipcMain.handle('settings:update', (_event, patch: unknown): Settings => {
    const next = updateSettings(patch);
    onSettingsChanged(next);
    return next;
  });
  ipcMain.handle('system:blurSupported', (): boolean => osBlurSupported());

  // --- Items and sync ------------------------------------------------------
  ipcMain.handle('items:list', (): ReminderItem[] => sync.items());
  ipcMain.handle('sync:status', (): SyncStatus => sync.status());
  ipcMain.handle('sync:now', async (): Promise<SyncStatus> => {
    await sync.syncNow();
    // New data may contain alerts that are already due.
    alerts.tick();
    return sync.status();
  });

  // --- Notion token -------------------------------------------------------
  // The token only ever travels renderer -> main. Nothing sends it back.
  ipcMain.handle('notion:setToken', async (_event, token: unknown): Promise<ActionResult> => {
    try {
      notion.saveToken(typeof token === 'string' ? token : '');
      // Pull data with the new token right away.
      void sync.syncNow().then(() => alerts.tick());
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle('notion:clearToken', (): void => {
    notion.clearToken();
    // Without a token the cached Notion items are dropped too.
    sync.clearRemote();
  });
  ipcMain.handle('notion:test', (): Promise<ConnectionTest> => notion.test());

  // --- Manual reminders ----------------------------------------------------
  // Each change re-reads local items and ticks, so a reminder set for "now"
  // pops up without waiting for the next 15 second tick.
  const afterReminderChange = async () => {
    await sync.refreshLocal();
    alerts.tick();
  };
  ipcMain.handle('reminders:list', (): ManualReminder[] => listReminders());
  ipcMain.handle('reminders:save', async (_event, input: unknown): Promise<ActionResult> => {
    try {
      saveReminder(input);
      await afterReminderChange();
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle('reminders:delete', async (_event, id: string): Promise<void> => {
    deleteReminder(String(id));
    await afterReminderChange();
  });
  ipcMain.handle('reminders:setDone', async (_event, id: string, done: boolean): Promise<void> => {
    setReminderDone(String(id), Boolean(done));
    await afterReminderChange();
  });
}
