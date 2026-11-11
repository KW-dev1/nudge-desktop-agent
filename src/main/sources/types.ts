import type { ReminderItem } from '../../shared/types';

/** Inclusive range of local calendar dates (YYYY-MM-DD) to fetch. */
export type FetchRange = { from: string; to: string };

/**
 * One place reminders come from. Every source returns the same ReminderItem
 * shape, so the scheduler and the UI never need to know where an item came
 * from. Adding a source (for example the phase 2 agent Alerts table) means
 * writing one of these and adding it to the list in index.ts.
 */
export interface ReminderSourceAdapter {
  /** Stable ID, also used as the cache key. */
  id: string;
  /** Name shown in the sync status footer. */
  label: string;
  /**
   * Remote sources are fetched on the sync interval and cached for offline
   * use. Local sources are read directly every time and never cached.
   */
  remote: boolean;
  fetch(range: FetchRange): Promise<ReminderItem[]>;
  /** Mark an item done at the source. Missing when the source cannot. */
  markDone?(item: ReminderItem): Promise<void>;
}
