// The scheduler tick (section 5.3 and 5.4 of the spec). Called every 15
// seconds with the current time. It decides which alerts to show now and
// returns the new persisted state. Pure logic: no timers, no I/O, no Electron.

import { headlineFor } from '../../shared/headline';
import type { FiredAlert, PlannedAlert, ReminderItem, Snooze } from '../../shared/types';
import { planAlerts, type SchedulerConfig } from './plan';
import { DAY, MINUTE, startOfNextDay } from './time';

/** What the scheduler remembers between ticks and across restarts. */
export type SchedulerState = {
  /** Alert key -> epoch ms when it fired. Stops repeats after a restart. */
  fired: Record<string, number>;
  /** Alerts waiting to come back after a snooze. */
  snoozes: Snooze[];
};

export const EMPTY_STATE: SchedulerState = { fired: {}, snoozes: [] };

/** A meeting alert may still fire this long after the start (covers a late tick). */
const START_GRACE = MINUTE;
/** A snoozed meeting alert is dropped once the start is this far in the past. */
const SNOOZE_MEETING_CUTOFF = 15 * MINUTE;
/** Tasks overdue by more than this are marked fired without a popup. */
const TASK_MAX_OVERDUE = DAY;
/** Fired keys older than this are forgotten. */
const FIRED_KEY_MAX_AGE = 30 * DAY;

export type TickResult = {
  /** Alerts to put in the popup now. At most one per item. */
  show: FiredAlert[];
  state: SchedulerState;
  /** True when `state` differs from the input and needs saving. */
  changed: boolean;
};

/** Items are unique per source, so this identifies one item across alerts. */
function itemKey(item: ReminderItem): string {
  return `${item.source}|${item.id}`;
}

/**
 * True when a due alert is too old to be worth a popup:
 * - a meeting that has already started
 * - a date-only meeting whose day is over
 * - a task or follow-up overdue by 24 hours or more
 */
function isStale(alert: PlannedAlert, now: number): boolean {
  if (alert.item.kind === 'meeting') {
    if (alert.item.hasTime) return now > alert.eventAt + START_GRACE;
    return now >= startOfNextDay(alert.eventAt);
  }
  return now - alert.fireAt >= TASK_MAX_OVERDUE;
}

/** True when a snoozed alert should be dropped instead of shown again. */
function isSnoozeExpired(alert: PlannedAlert, now: number): boolean {
  if (alert.item.kind !== 'meeting') return false;
  if (alert.item.hasTime) return now > alert.eventAt + SNOOZE_MEETING_CUTOFF;
  return now >= startOfNextDay(alert.eventAt);
}

/**
 * Run one scheduler tick.
 *
 * Because every decision compares `now` against stored times, it does not
 * matter how long ago the previous tick was. A tick after sleep, a restart,
 * or an hour-long pause simply catches up.
 */
export function runTick(
  now: number,
  items: ReminderItem[],
  state: SchedulerState,
  config: SchedulerConfig,
): TickResult {
  const plan = planAlerts(items, config);
  const byKey = new Map(plan.map((a) => [a.key, a]));
  const fired = { ...state.fired };
  let changed = false;

  // Alerts that are due on this tick, before reducing to one per item.
  const due: PlannedAlert[] = [];

  // 1. Snoozed alerts. A snooze only lives while its alert is still in the
  // plan. If the item was deleted, marked done, or rescheduled, the key is
  // gone and the snooze is dropped with it.
  const snoozes: Snooze[] = [];
  for (const snooze of state.snoozes) {
    const alert = byKey.get(snooze.key);
    if (!alert || isSnoozeExpired(alert, now)) {
      changed = true;
    } else if (snooze.until <= now) {
      due.push(alert);
      changed = true;
    } else {
      snoozes.push(snooze);
    }
  }
  const snoozedKeys = new Set(snoozes.map((s) => s.key));

  // 2. Alerts that have never fired and whose time has come.
  for (const alert of plan) {
    if (alert.key in fired || snoozedKeys.has(alert.key)) continue;
    if (alert.fireAt > now) continue;
    if (isStale(alert, now)) {
      // Missed for good: remember it so it is not looked at again.
      fired[alert.key] = now;
      changed = true;
    } else {
      due.push(alert);
    }
  }

  // 3. One popup per item. When several alerts for the same item are due at
  // once (both lead times passed while the app was closed, or a snooze ends
  // as the next lead time arrives), keep the one closest to the event.
  const chosen = new Map<string, PlannedAlert>();
  for (const alert of due) {
    const current = chosen.get(itemKey(alert.item));
    if (!current || alert.fireAt > current.fireAt) chosen.set(itemKey(alert.item), alert);
  }

  // Every due alert counts as fired, shown or not, so none of them repeats.
  for (const alert of due) {
    fired[alert.key] = now;
    changed = true;
  }

  const show: FiredAlert[] = [...chosen.values()]
    .sort((a, b) => a.eventAt - b.eventAt)
    .map((alert) => ({
      key: alert.key,
      item: alert.item,
      alertKind: alert.alertKind,
      eventAt: alert.eventAt,
      headline: headlineFor({ kind: alert.item.kind, hasTime: alert.item.hasTime, eventAt: alert.eventAt }, now),
      firedAt: now,
    }));

  return { show, state: changed ? { fired, snoozes } : state, changed };
}

/**
 * Snooze an alert: it comes back `minutes` from now. Replaces any earlier
 * snooze of the same alert.
 */
export function snoozeAlert(state: SchedulerState, key: string, minutes: number, now: number): SchedulerState {
  return {
    // The alert was already shown once, so it stays in the fired list. That
    // keeps the normal path from firing it while the snooze is pending.
    fired: { ...state.fired, [key]: state.fired[key] ?? now },
    snoozes: [...state.snoozes.filter((s) => s.key !== key), { key, until: now + minutes * MINUTE }],
  };
}

/** Dismiss an alert for good: mark it fired and cancel any snooze. */
export function dismissAlert(state: SchedulerState, key: string, now: number): SchedulerState {
  return {
    fired: { ...state.fired, [key]: state.fired[key] ?? now },
    snoozes: state.snoozes.filter((s) => s.key !== key),
  };
}

/**
 * Forget fired keys older than 30 days. Keys of pending snoozes are kept
 * regardless, so a snooze can never resurrect as a brand-new alert.
 */
export function pruneFired(state: SchedulerState, now: number): SchedulerState {
  const snoozed = new Set(state.snoozes.map((s) => s.key));
  const entries = Object.entries(state.fired);
  const kept = entries.filter(([key, at]) => snoozed.has(key) || now - at < FIRED_KEY_MAX_AGE);
  if (kept.length === entries.length) return state;
  return { ...state, fired: Object.fromEntries(kept) };
}
