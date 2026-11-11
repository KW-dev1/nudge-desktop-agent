import { useEffect, useRef, useState } from 'react';
import { headlineFor } from '../../../shared/headline';
import { SNOOZE_CHOICES, type FiredAlert } from '../../../shared/types';
import { KIND_LABEL, formatWhen } from '../lib/format';
import {
  CheckSquareIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  ExternalIcon,
  KindIcon,
} from './icons';

export type PopupCardProps = {
  alert: FiredAlert;
  /** Current time, passed in so the headline can keep counting down. */
  now: number;
  /** Position in the stack, zero-based, and the stack size. */
  index: number;
  count: number;
  /** Default snooze length for the main Snooze button. */
  snoozeMinutes: number;
  /** Shown inline when Mark done failed. */
  error?: string | null;
  /** True while Mark done is in flight. */
  busy?: boolean;
  /** Card fills the window with no radius or shadow (OS blur backdrop). */
  flat?: boolean;
  className?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onDismiss?: () => void;
  onSnooze?: (minutes: number) => void;
  onMarkDone?: () => void;
  onOpen?: () => void;
};

/** One labeled detail line. Renders nothing when the value is empty. */
function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-[13px] leading-5">
      <dt className="w-16 shrink-0 text-[var(--nudge-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

/**
 * The alert card. Used by the real popup window and by the live preview in
 * Settings, so both always look the same. It only draws; every action is a
 * callback.
 */
export function PopupCard(props: PopupCardProps) {
  const { alert, now, index, count, snoozeMinutes, error, busy, flat } = props;
  const { item } = alert;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the snooze menu when the card switches to another alert.
  useEffect(() => setMenuOpen(false), [alert.key]);

  // Close the snooze menu on a click anywhere else.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // Recomputed from the real time left, so it never goes stale on screen.
  const headline = headlineFor({ kind: item.kind, hasTime: item.hasTime, eventAt: alert.eventAt }, now);

  // Spec 6.3: Open in Notion is hidden for manual reminders (no URL), and
  // Mark done is hidden for Notion meetings.
  const canOpen = Boolean(item.url);
  const canMarkDone = item.source !== 'notion-meeting';
  const isMeeting = item.kind === 'meeting';
  const details = (
    <>
      {/* Client, With, and Type are meeting fields. */}
      <Detail label="Client" value={item.client} />
      <Detail label="With" value={item.with} />
      <Detail label="Type" value={item.type} />
      {/* Priority and Notes are task fields. Manual reminders use "Note". */}
      <Detail label="Priority" value={item.priority} />
      <Detail label={item.source === 'manual' ? 'Note' : 'Notes'} value={item.notes} />
    </>
  );
  const hasDetails = Boolean(item.client || item.with || item.type || item.priority || item.notes);

  return (
    <section
      role="alertdialog"
      aria-label={`${headline}: ${item.title}`}
      className={`nudge-card ${flat ? 'nudge-card-flat' : ''} flex w-full flex-col gap-4 p-6 ${props.className ?? ''}`}
    >
      {/* Top row: kind label on the left, stack counter and close on the right. */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[var(--nudge-accent-text)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--nudge-surface)]">
            <KindIcon kind={item.kind} size={16} />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.08em]">{KIND_LABEL[item.kind]}</span>
        </div>

        <div className="flex items-center gap-1">
          {count > 1 && (
            <div className="mr-1 flex items-center gap-0.5 text-[var(--nudge-muted)]">
              <button
                type="button"
                aria-label="Previous alert"
                onClick={props.onPrev}
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--nudge-surface)] hover:text-[var(--nudge-fg)]"
              >
                <ChevronLeftIcon size={16} />
              </button>
              <span className="min-w-[44px] text-center text-xs font-semibold tabular-nums">
                {index + 1} of {count}
              </span>
              <button
                type="button"
                aria-label="Next alert"
                onClick={props.onNext}
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--nudge-surface)] hover:text-[var(--nudge-fg)]"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss (Esc)"
            onClick={props.onDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--nudge-muted)] hover:bg-[var(--nudge-surface)] hover:text-[var(--nudge-fg)]"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </header>

      {/* Headline, title, and when. */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-[var(--nudge-accent-text)]">{headline}</p>
        <h1 className="text-[22px] font-semibold leading-7 break-words">{item.title || 'Untitled'}</h1>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[13px] text-[var(--nudge-muted)]">
            <ClockIcon size={14} />
            {formatWhen(item)}
          </p>
          {/* Sits by the title rather than in the button row, which keeps
              the row to one line even when every action is available. */}
          {canOpen && (
            <button
              type="button"
              onClick={props.onOpen}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-semibold text-[var(--nudge-accent-text)] hover:bg-[var(--nudge-surface)]"
            >
              Open in Notion
              <ExternalIcon size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Details. Empty fields are skipped; the whole block goes if all are. */}
      {hasDetails && (
        <dl
          className={`flex flex-col gap-1.5 border-t border-[var(--nudge-border)] pt-4 ${isMeeting ? '' : 'max-h-40 overflow-y-auto'}`}
        >
          {details}
        </dl>
      )}

      {/* Mark done failed: say why and keep the alert open. */}
      {error && (
        <p role="alert" className="rounded-lg bg-[var(--nudge-surface)] px-3 py-2 text-[13px] text-[var(--nudge-danger)]">
          {error}
        </p>
      )}

      {/* Actions. */}
      <footer className="flex items-center gap-2">
        {/* Snooze: the main button uses the default length, the arrow opens the menu. */}
        <div ref={menuRef} className="relative flex">
          <button
            type="button"
            className="nudge-btn !rounded-r-none !pr-2.5"
            onClick={() => props.onSnooze?.(snoozeMinutes)}
          >
            Snooze {snoozeMinutes} min
          </button>
          <button
            type="button"
            aria-label="More snooze lengths"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="nudge-btn !rounded-l-none !px-1.5 border-l border-[var(--nudge-border)]"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <ChevronDownIcon size={14} />
          </button>
          {menuOpen && (
            // Opens upward so it stays inside the popup window.
            <div
              role="menu"
              className="absolute bottom-full left-0 z-10 mb-1.5 w-36 overflow-hidden rounded-xl border border-[var(--nudge-border)] bg-[var(--nudge-bg-solid)] p-1 shadow-xl"
            >
              {SNOOZE_CHOICES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-[13px] hover:bg-[var(--nudge-surface)]"
                  onClick={() => {
                    setMenuOpen(false);
                    props.onSnooze?.(minutes);
                  }}
                >
                  {minutes} minutes
                </button>
              ))}
            </div>
          )}
        </div>

        {canMarkDone && (
          <button type="button" className="nudge-btn" disabled={busy} onClick={props.onMarkDone}>
            <CheckSquareIcon size={14} />
            {busy ? 'Saving…' : 'Mark done'}
          </button>
        )}

        <button type="button" className="nudge-btn nudge-btn-primary ml-auto" onClick={props.onDismiss}>
          Dismiss
        </button>
      </footer>
    </section>
  );
}
