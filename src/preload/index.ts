import { contextBridge, ipcRenderer } from 'electron';
import type { ActionResult, PopupPayload } from '../shared/types';

// The renderer has no Node access. Everything it can do goes through this
// small, explicit bridge. Each function maps to one channel in main/ipc.ts.
const api = {
  platform: process.platform,

  popup: {
    /** Called once when the popup page loads. Returns the current state. */
    ready: (): Promise<PopupPayload> => ipcRenderer.invoke('popup:ready'),
    /** Subscribe to state changes. Returns a function that unsubscribes. */
    onUpdate: (callback: (payload: PopupPayload) => void): (() => void) => {
      const listener = (_event: unknown, payload: PopupPayload) => callback(payload);
      ipcRenderer.on('popup:update', listener);
      return () => ipcRenderer.removeListener('popup:update', listener);
    },
    dismiss: (key: string): void => ipcRenderer.send('popup:dismiss', key),
    snooze: (key: string, minutes: number): void => ipcRenderer.send('popup:snooze', key, minutes),
    openInNotion: (key: string): void => ipcRenderer.send('popup:open', key),
    markDone: (key: string): Promise<ActionResult> => ipcRenderer.invoke('popup:markDone', key),
    /** Report the card height so the window can be sized to fit. */
    resize: (height: number): void => ipcRenderer.send('popup:resize', height),
    /** The fade-out finished; the window can be hidden. */
    hidden: (): void => ipcRenderer.send('popup:hidden'),
  },
};

contextBridge.exposeInMainWorld('nudge', api);

export type NudgeApi = typeof api;
