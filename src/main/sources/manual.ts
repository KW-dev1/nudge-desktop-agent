import { manualToItem } from '../../shared/reminders';
import type { ManualReminder } from '../../shared/types';
import type { ReminderSourceAdapter } from './types';

/** The storage the manual source needs. Injected so tests can fake it. */
export type ManualReminderRepo = {
  list(): ManualReminder[];
  setDone(id: string, done: boolean): void;
};

/**
 * Reminders typed into the app. Local only: this source works with no
 * network and no Notion token.
 */
export function createManualSource(repo: ManualReminderRepo): ReminderSourceAdapter {
  return {
    id: 'manual',
    label: 'Manual reminders',
    remote: false,
    // The date range is ignored on purpose. Local data is cheap to read, and
    // a reminder set months ahead should still show under "Later".
    async fetch() {
      return repo.list().map(manualToItem);
    },
    async markDone(item) {
      repo.setDone(item.id, true);
    },
  };
}
