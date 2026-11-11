import { groupUpcoming, type UpcomingGroupName } from '../../../shared/upcoming';
import type { ReminderItem } from '../../../shared/types';
import type { AppData } from '../hooks/useAppData';
import { KIND_LABEL, formatTime, formatWhen } from '../lib/format';
import { ExternalIcon, KindIcon } from './icons';

/** "Notion" or "Manual": where the row came from. */
function SourceBadge({ item }: { item: ReminderItem }) {
  const label = item.source === 'manual' ? 'Manual' : 'Notion';
  return (
    <span className="rounded-md border border-[var(--nudge-border)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--nudge-muted)]">
      {label}
    </span>
  );
}

function Row({ item, group }: { item: ReminderItem; group: UpcomingGroupName }) {
  // Today and Tomorrow already say the day, so those rows show the time only.
  const when = group === 'Today' || group === 'Tomorrow' ? formatTime(item) : formatWhen(item);
  const meta = [KIND_LABEL[item.kind], item.client, item.priority && `${item.priority} priority`].filter(Boolean);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--nudge-bg-solid)] text-[var(--nudge-accent-text)]">
        <KindIcon kind={item.kind} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.title || 'Untitled'}</p>
        <p className="truncate text-xs text-[var(--nudge-muted)]">{meta.join(' · ')}</p>
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums">{when}</span>
      <SourceBadge item={item} />
      {item.url ? (
        // Opens in the default browser (see setWindowOpenHandler in main).
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${item.title} in Notion`}
          title="Open in Notion"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--nudge-muted)] hover:bg-[var(--nudge-bg-solid)] hover:text-[var(--nudge-fg)]"
        >
          <ExternalIcon size={14} />
        </a>
      ) : (
        <span className="w-7 shrink-0" />
      )}
    </li>
  );
}

/** Everything coming up from Notion and manual entry, grouped by day. */
export function UpcomingTab({ data }: { data: AppData }) {
  const groups = groupUpcoming(data.items, data.now, data.settings.morningTime);

  if (groups.length === 0) {
    return (
      <div className="nudge-panel px-6 py-12 text-center">
        <p className="text-sm font-semibold">Nothing coming up</p>
        <p className="mt-1 text-xs text-[var(--nudge-muted)]">
          {data.sync.hasToken
            ? 'Add a reminder, or check back after the next sync.'
            : 'Add a reminder, or connect Notion in Settings to see your meetings and tasks.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.name}>
          <h2 className="mb-2 flex items-baseline gap-2 px-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--nudge-muted)]">
            <span className={group.name === 'Overdue' ? 'text-[var(--nudge-danger)]' : ''}>{group.name}</span>
            <span className="font-medium">{group.rows.length}</span>
          </h2>
          <ul className="nudge-panel divide-y divide-[var(--nudge-border)]">
            {group.rows.map(({ item }) => (
              <Row key={`${item.source}|${item.id}`} item={item} group={group.name} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
