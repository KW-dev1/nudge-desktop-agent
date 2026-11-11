import Store from 'electron-store';
import { EMPTY_STATE, type SchedulerState } from '../scheduler/tick';

type Persisted = SchedulerState & {
  /** Epoch ms until which alerts are paused from the tray, or 0. */
  pausedUntil: number;
};

// scheduler.json: fired keys, pending snoozes, and the tray pause. This is
// what makes "no repeats after a restart" and "snooze survives a restart" work.
const store = new Store<Persisted>({
  name: 'scheduler',
  defaults: { ...EMPTY_STATE, pausedUntil: 0 },
});

export function loadSchedulerState(): SchedulerState {
  return { fired: store.get('fired'), snoozes: store.get('snoozes') };
}

export function saveSchedulerState(state: SchedulerState): void {
  store.set({ fired: state.fired, snoozes: state.snoozes });
}

export function getPausedUntil(): number {
  return store.get('pausedUntil');
}

export function setPausedUntil(until: number): void {
  store.set('pausedUntil', until);
}
