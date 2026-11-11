import { ipcMain } from 'electron';
import type { ActionResult } from '../shared/types';
import type { AlertService } from './alerts';
import { popupHidden, popupPayload, popupResized } from './windows/popup';

export type IpcDeps = {
  alerts: AlertService;
};

/** Turn a thrown error into something the renderer can show inline. */
function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' };
}

/**
 * Register every channel the renderer can call. The renderer has no Node
 * access; this file is the full list of what it is allowed to do.
 */
export function registerIpc({ alerts }: IpcDeps): void {
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
}
