import { useState } from 'react';
import type { AppData } from '../hooks/useAppData';
import { formatClock } from '../lib/format';

/** Footer of the main window: last sync time, last error, and Sync now. */
export function SyncFooter({ data }: { data: AppData }) {
  const { sync } = data;
  const [busy, setBusy] = useState(false);
  const errors = sync.sources.filter((s) => s.error);

  let text: string;
  if (!sync.hasToken) text = 'Notion is not connected. Manual reminders still work.';
  else if (sync.syncing || busy) text = 'Syncing…';
  else if (sync.lastSync) text = `Last sync ${formatClock(sync.lastSync)}`;
  else text = 'Not synced yet';

  return (
    <footer className="flex items-center gap-3 border-t border-[var(--nudge-border)] px-6 py-2.5 text-xs">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${
          errors.length > 0
            ? 'bg-[var(--nudge-danger)]'
            : sync.hasToken && sync.lastSync
              ? 'bg-emerald-400'
              : 'bg-[var(--nudge-muted)]'
        }`}
      />
      <span className="shrink-0 text-[var(--nudge-muted)]">{text}</span>
      {/* The last error, if any. Cached items keep alerting while this shows. */}
      {errors.length > 0 && (
        <span
          role="status"
          className="min-w-0 flex-1 truncate text-[var(--nudge-danger)]"
          title={errors.map((s) => `${s.label}: ${s.error}`).join('\n')}
        >
          {errors.map((s) => `${s.label}: ${s.error}`).join(' · ')}
        </span>
      )}
      <button
        type="button"
        className="nudge-btn ml-auto !h-7 shrink-0 !px-3 !text-xs"
        disabled={busy || sync.syncing}
        onClick={() => {
          setBusy(true);
          void data.syncNow().finally(() => setBusy(false));
        }}
      >
        Sync now
      </button>
    </footer>
  );
}
