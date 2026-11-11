import { shell } from 'electron';
import type { FiredAlert, ReminderItem, Settings } from '../shared/types';
import { dismissAlert, pruneFired, runTick, snoozeAlert, type SchedulerState } from './scheduler/tick';
import { HOUR } from './scheduler/time';

/** The scheduler ticks this often and compares "now" with pending alerts. */
const TICK_MS = 15_000;

export type AlertServiceDeps = {
  /** Every current item from every source (cached Notion plus manual). */
  getItems: () => ReminderItem[];
  getSettings: () => Settings;
  loadState: () => SchedulerState;
  saveState: (state: SchedulerState) => void;
  getPausedUntil: () => number;
  setPausedUntil: (until: number) => void;
  /** Mark the item done at its source. Rejects when that fails. */
  markDone: (item: ReminderItem) => Promise<void>;
  /** Called with the open alerts whenever they change. `isNew` asks for a chime. */
  onStackChange: (alerts: FiredAlert[], isNew: boolean) => void;
  /** Called after pause or resume so the tray menu can update. */
  onPauseChange: () => void;
  log: (message: string) => void;
};

/**
 * Glue between the pure scheduler and the rest of the app. It owns the tick
 * timer, the saved scheduler state, and the stack of alerts currently open
 * in the popup.
 */
export class AlertService {
  private state: SchedulerState;
  private stack: FiredAlert[] = [];
  private timer: NodeJS.Timeout | null = null;
  private lastPrune = 0;
  /** Auto-dismiss timers by alert key. */
  private autoDismiss = new Map<string, NodeJS.Timeout>();

  constructor(private deps: AlertServiceDeps) {
    this.state = deps.loadState();
  }

  /** Start ticking. The first tick runs right away to catch missed alerts. */
  start(): void {
    if (this.timer) return;
    // A short repeating timer on purpose. One long timer per alert would
    // drift or fire late after the computer sleeps.
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.autoDismiss.values()) clearTimeout(t);
    this.autoDismiss.clear();
  }

  /** Run one scheduler pass now. Safe to call at any time. */
  tick(): void {
    const now = Date.now();
    if (this.isPaused(now)) return;

    try {
      const { leadTimes, morningTime } = this.deps.getSettings();
      const result = runTick(now, this.deps.getItems(), this.state, { leadTimes, morningTime });
      if (result.changed) this.setState(result.state);
      if (result.show.length > 0) this.addToStack(result.show);

      // Housekeeping once an hour: forget fired keys older than 30 days.
      if (now - this.lastPrune > HOUR) {
        this.lastPrune = now;
        const pruned = pruneFired(this.state, now);
        if (pruned !== this.state) this.setState(pruned);
      }
    } catch (error) {
      // One bad item must never stop the scheduler.
      this.deps.log(`Scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** The alerts currently open in the popup. */
  current(): FiredAlert[] {
    return this.stack;
  }

  /** Close an alert for good. It will not come back. */
  dismiss(key: string): void {
    this.setState(dismissAlert(this.state, key, Date.now()));
    this.removeFromStack(key);
  }

  /** Close an alert and bring it back after `minutes`. */
  snooze(key: string, minutes: number): void {
    if (!this.stack.some((a) => a.key === key)) return;
    const length = Number.isFinite(minutes) && minutes > 0 ? minutes : this.deps.getSettings().snoozeMinutes;
    this.setState(snoozeAlert(this.state, key, length, Date.now()));
    this.removeFromStack(key);
  }

  /**
   * Mark the alert's item done at its source, then close the alert. If the
   * source rejects (offline, no permission) the alert stays open and the
   * error goes back to the popup.
   */
  async markDone(key: string): Promise<void> {
    const alert = this.stack.find((a) => a.key === key);
    if (!alert) return;
    await this.deps.markDone(alert.item);
    this.dismiss(key);
  }

  /** Open the item's Notion page in the default browser. */
  openInNotion(key: string): void {
    const url = this.stack.find((a) => a.key === key)?.item.url;
    // Only ever hand https links to the OS.
    if (url && url.startsWith('https://')) void shell.openExternal(url);
  }

  /** Show a sample alert so the user can see the popup without waiting. */
  showSample(): void {
    const now = Date.now();
    const eventAt = now + 30 * 60_000;
    this.addToStack([
      {
        key: `sample|${now}`,
        item: {
          id: 'sample',
          source: 'manual',
          kind: 'meeting',
          title: 'Sample meeting',
          start: new Date(eventAt).toISOString(),
          hasTime: true,
          done: false,
          client: 'Kenneth',
          with: 'Ana and John',
          type: 'Client check-in',
        },
        alertKind: 'lead-30',
        eventAt,
        headline: 'Meeting in 30 minutes',
        firedAt: now,
      },
    ]);
  }

  // --- Pause from the tray -------------------------------------------------

  isPaused(now = Date.now()): boolean {
    return this.deps.getPausedUntil() > now;
  }

  pausedUntil(): number {
    return this.deps.getPausedUntil();
  }

  /** Pause for an hour, or resume when already paused. */
  togglePause(): void {
    const paused = this.isPaused();
    this.deps.setPausedUntil(paused ? 0 : Date.now() + HOUR);
    this.deps.onPauseChange();
    // On resume, catch up at once. Meetings that have not started yet still
    // fire with the real time left; the missed-alert rules handle the rest.
    if (paused) this.tick();
  }

  // --- Internals -----------------------------------------------------------

  private setState(state: SchedulerState): void {
    this.state = state;
    this.deps.saveState(state);
  }

  private addToStack(alerts: FiredAlert[]): void {
    for (const alert of alerts) {
      // A newer alert for an item that is already on screen replaces the old
      // one (the 30 minute alert takes over from an unanswered 60 minute one).
      const same = (a: FiredAlert) => a.item.source === alert.item.source && a.item.id === alert.item.id;
      const index = this.stack.findIndex(same);
      if (index >= 0) {
        this.clearAutoDismiss(this.stack[index]!.key);
        this.stack = this.stack.map((a, i) => (i === index ? alert : a));
      } else {
        this.stack = [...this.stack, alert];
      }

      const seconds = this.deps.getSettings().autoDismissSeconds;
      if (seconds > 0) {
        this.autoDismiss.set(
          alert.key,
          setTimeout(() => this.dismiss(alert.key), seconds * 1000),
        );
      }
    }
    this.deps.onStackChange(this.stack, true);
  }

  private removeFromStack(key: string): void {
    this.clearAutoDismiss(key);
    if (!this.stack.some((a) => a.key === key)) return;
    this.stack = this.stack.filter((a) => a.key !== key);
    this.deps.onStackChange(this.stack, false);
  }

  private clearAutoDismiss(key: string): void {
    const timer = this.autoDismiss.get(key);
    if (timer) clearTimeout(timer);
    this.autoDismiss.delete(key);
  }
}
