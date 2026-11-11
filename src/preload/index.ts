import { contextBridge, ipcRenderer } from 'electron';
import type { ReminderInput } from '../shared/reminders';
import type {
  ActionResult,
  ConnectionTest,
  ManualReminder,
  PopupPayload,
  ReminderItem,
  Settings,
  SyncStatus,
} from '../shared/types';

/** Subscribe to a channel pushed from main. Returns a function that unsubscribes. */
function listen<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: unknown, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

/** A partial settings change. Appearance fields can be patched one at a time. */
export type SettingsPatch = Partial<Omit<Settings, 'appearance'>> & { appearance?: Partial<Settings['appearance']> };

// The renderer has no Node access. Everything it can do goes through this
// small, explicit bridge. Each function maps to one channel in main/ipc.ts.
const api = {
  platform: process.platform,

  popup: {
    /** Called once when the popup page loads. Returns the current state. */
    ready: (): Promise<PopupPayload> => ipcRenderer.invoke('popup:ready'),
    onUpdate: (callback: (payload: PopupPayload) => void) => listen('popup:update', callback),
    dismiss: (key: string): void => ipcRenderer.send('popup:dismiss', key),
    snooze: (key: string, minutes: number): void => ipcRenderer.send('popup:snooze', key, minutes),
    openInNotion: (key: string): void => ipcRenderer.send('popup:open', key),
    markDone: (key: string): Promise<ActionResult> => ipcRenderer.invoke('popup:markDone', key),
    /** Report the card height so the window can be sized to fit. */
    resize: (height: number): void => ipcRenderer.send('popup:resize', height),
    /** The fade-out finished; the window can be hidden. */
    hidden: (): void => ipcRenderer.send('popup:hidden'),
    /** Show a sample alert in the real popup window. */
    showSample: (): void => ipcRenderer.send('popup:sample'),
  },

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    update: (patch: SettingsPatch): Promise<Settings> => ipcRenderer.invoke('settings:update', patch),
    /** Whether this OS can blur what is behind the popup. */
    blurSupported: (): Promise<boolean> => ipcRenderer.invoke('system:blurSupported'),
  },

  items: {
    /** Every known item: cached Notion items plus manual reminders. */
    list: (): Promise<ReminderItem[]> => ipcRenderer.invoke('items:list'),
    /** Fires when items, reminders, or sync status change. */
    onChanged: (callback: () => void) => listen<void>('data:changed', callback),
  },

  sync: {
    status: (): Promise<SyncStatus> => ipcRenderer.invoke('sync:status'),
    now: (): Promise<SyncStatus> => ipcRenderer.invoke('sync:now'),
  },

  notion: {
    /**
     * Save the integration token. It is encrypted in the main process and
     * there is no call that reads it back.
     */
    setToken: (token: string): Promise<ActionResult> => ipcRenderer.invoke('notion:setToken', token),
    clearToken: (): Promise<void> => ipcRenderer.invoke('notion:clearToken'),
    /** Check the saved token and report which sources it can read. */
    test: (): Promise<ConnectionTest> => ipcRenderer.invoke('notion:test'),
  },

  reminders: {
    list: (): Promise<ManualReminder[]> => ipcRenderer.invoke('reminders:list'),
    save: (input: ReminderInput): Promise<ActionResult> => ipcRenderer.invoke('reminders:save', input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('reminders:delete', id),
    setDone: (id: string, done: boolean): Promise<void> => ipcRenderer.invoke('reminders:setDone', id, done),
  },
};

contextBridge.exposeInMainWorld('nudge', api);

export type NudgeApi = typeof api;
