// Types shared by the main process and the renderer. Nothing in this folder
// may import Electron or Node APIs, so both sides can use it.

export type ReminderSource = 'notion-meeting' | 'notion-task' | 'manual';
export type ReminderKind = 'meeting' | 'task' | 'follow-up';

/**
 * The one normalized shape every source returns. The scheduler and the UI
 * only ever see this, never raw Notion pages or stored manual records.
 */
export type ReminderItem = {
  id: string;
  source: ReminderSource;
  kind: ReminderKind;
  title: string;
  /**
   * With a time: an ISO datetime. Notion values carry an offset
   * ("2026-11-12T15:00:00.000-06:00"); manual ones are local
   * ("2026-11-12T15:00"). Without a time: a plain date ("2026-11-12").
   */
  start: string;
  hasTime: boolean;
  done: boolean;
  client?: string;
  with?: string;
  type?: string;
  priority?: string;
  notes?: string;
  url?: string;
};

/** A reminder the user typed into the app. Stored locally, never in Notion. */
export type ManualReminder = {
  id: string;
  title: string;
  kind: ReminderKind;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local 24-hour time, HH:mm. Missing means "date only". */
  time?: string;
  note: string;
  done: boolean;
  /** ISO timestamp of when the reminder was created. */
  createdAt: string;
};

/**
 * What kind of alert this is for its item:
 * - `lead-N`: N minutes before a meeting that has a start time
 * - `day`: the morning alert for a meeting that only has a date
 * - `due`: the moment a task or follow-up comes due
 */
export type AlertKind = `lead-${number}` | 'day' | 'due';

/** An alert the scheduler has planned but not necessarily fired yet. */
export type PlannedAlert = {
  /** Stable identity: source + item ID + alert kind + scheduled time. */
  key: string;
  item: ReminderItem;
  alertKind: AlertKind;
  /** Epoch ms when the popup should appear. */
  fireAt: number;
  /** Epoch ms of the event itself: meeting start, or task due time. */
  eventAt: number;
};

/** An alert that is due right now and goes to the popup. */
export type FiredAlert = {
  key: string;
  item: ReminderItem;
  alertKind: AlertKind;
  eventAt: number;
  /** For example "Meeting in 30 minutes". Computed from the real time left. */
  headline: string;
  firedAt: number;
};

/** A snoozed alert waiting to come back. Persisted so it survives a restart. */
export type Snooze = {
  key: string;
  /** Epoch ms when the alert should re-fire. */
  until: number;
};

export type Appearance = {
  /** Popup background color, #rrggbb. */
  background: string;
  /** How see-through the background is, 0 to 50 (percent). */
  transparency: number;
  /** Corner radius in px, 0 to 32. */
  radius: number;
  /** Accent color for buttons and highlights, #rrggbb. */
  accent: string;
  /** Blur what is behind the popup, when the OS supports it. */
  blur: boolean;
};

export type Settings = {
  /** Minutes before a meeting to alert. One alert per entry. */
  leadTimes: number[];
  /** Local time (HH:mm) used for items that have a date but no time. */
  morningTime: string;
  snoozeMinutes: number;
  syncIntervalMinutes: number;
  sound: boolean;
  /** Seconds before a popup closes on its own. 0 means never. */
  autoDismissSeconds: number;
  startWithWindows: boolean;
  appearance: Appearance;
};

export const DEFAULT_APPEARANCE: Appearance = {
  background: '#111827',
  transparency: 25,
  radius: 20,
  accent: '#6366f1',
  blur: false,
};

export const DEFAULT_SETTINGS: Settings = {
  leadTimes: [60, 30],
  morningTime: '09:00',
  snoozeMinutes: 10,
  syncIntervalMinutes: 2,
  sound: true,
  autoDismissSeconds: 0,
  startWithWindows: true,
  appearance: DEFAULT_APPEARANCE,
};

/** Width of the popup card in px. The window and the settings preview both use it. */
export const POPUP_CARD_WIDTH = 480;

/** Snooze lengths offered in the popup menu, in minutes. */
export const SNOOZE_CHOICES = [5, 10, 30, 60] as const;

/** Sync state for one remote source, shown in the main window footer. */
export type SourceStatus = {
  id: string;
  label: string;
  /** Epoch ms of the last successful fetch, or null if there never was one. */
  lastSuccess: number | null;
  /** Message from the last failed fetch. Cleared on the next success. */
  error: string | null;
};

export type SyncStatus = {
  syncing: boolean;
  /** False until the user saves a Notion token. */
  hasToken: boolean;
  /** Epoch ms of the last sync where every source succeeded. */
  lastSync: number | null;
  sources: SourceStatus[];
};

/** Result of the Test connection button, one entry per Notion source. */
export type ConnectionTest = {
  ok: boolean;
  /** Set when the token itself is rejected, before any source is tried. */
  error?: string;
  sources: { label: string; ok: boolean; error?: string }[];
};

/** Everything the popup window needs to draw itself. Sent on every change. */
export type PopupPayload = {
  /** The stack of open alerts. Empty means the popup should close. */
  alerts: FiredAlert[];
  appearance: Appearance;
  sound: boolean;
  /** Default snooze length for the main Snooze button, in minutes. */
  snoozeMinutes: number;
  /** Goes up by one each time a new alert arrives. The popup chimes on change. */
  chime: number;
  /**
   * True when the OS draws a blurred backdrop for the whole window. The card
   * then fills the window edge to edge and the OS rounds the corners.
   */
  osBlur: boolean;
};

/** Result of a popup action that can fail, such as Mark done. */
export type ActionResult = { ok: true } | { ok: false; error: string };
