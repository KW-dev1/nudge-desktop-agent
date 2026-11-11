import { useState } from 'react';
import { manualToItem, type ReminderInput } from '../../../shared/reminders';
import type { ManualReminder, ReminderKind } from '../../../shared/types';
import type { AppData } from '../hooks/useAppData';
import { KIND_LABEL, formatWhen } from '../lib/format';
import { KindIcon } from './icons';

const api = window.nudge.reminders;
const KINDS: ReminderKind[] = ['meeting', 'task', 'follow-up'];

/** Today as YYYY-MM-DD in local time, the default date for a new reminder. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const blank = (): ReminderInput => ({ title: '', kind: 'task', date: today(), time: '', note: '' });

/** Add, edit, and delete reminders that live only in this app. */
export function RemindersTab({ data }: { data: AppData }) {
  const [form, setForm] = useState<ReminderInput>(blank);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The reminder waiting for a second click on Delete. */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const editing = Boolean(form.id);

  const set = <K extends keyof ReminderInput>(key: K, value: ReminderInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Main validates again and returns a message for the form on failure.
    const result = await api.save(form);
    setSaving(false);
    if (result.ok) {
      setForm(blank());
      setError(null);
    } else {
      setError(result.error);
    }
  };

  const edit = (r: ManualReminder) => {
    setForm({ id: r.id, title: r.title, kind: r.kind, date: r.date, time: r.time ?? '', note: r.note, done: r.done });
    setError(null);
  };

  // Open items first by date, finished ones at the bottom.
  const sorted = [...data.reminders].sort(
    (a, b) => Number(a.done) - Number(b.done) || `${a.date}T${a.time ?? ''}`.localeCompare(`${b.date}T${b.time ?? ''}`),
  );

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={(e) => void submit(e)} className="nudge-panel flex flex-col gap-4 p-5">
        <h2 className="text-sm font-semibold">{editing ? 'Edit reminder' : 'New reminder'}</h2>

        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Title
          <input
            className="nudge-input"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="What should Nudge remind you about?"
            maxLength={200}
          />
        </label>

        <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-4">
          <fieldset className="flex flex-col gap-1.5 text-xs font-medium">
            <legend className="mb-1.5">Kind</legend>
            <div className="flex gap-1 rounded-[10px] border border-[var(--nudge-border)] bg-[var(--nudge-bg-solid)] p-1">
              {KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={form.kind === kind}
                  onClick={() => set('kind', kind)}
                  className={`flex h-[26px] items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold ${
                    form.kind === kind
                      ? 'bg-[var(--nudge-accent)] text-[var(--nudge-accent-fg)]'
                      : 'text-[var(--nudge-muted)] hover:text-[var(--nudge-fg)]'
                  }`}
                >
                  <KindIcon kind={kind} size={13} />
                  {KIND_LABEL[kind]}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Date
            <input type="date" className="nudge-input" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium">
            <span>
              Time <span className="font-normal text-[var(--nudge-muted)]">(optional)</span>
            </span>
            <input
              type="time"
              className="nudge-input"
              value={form.time ?? ''}
              onChange={(e) => set('time', e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium">
          <span>
            Note <span className="font-normal text-[var(--nudge-muted)]">(optional)</span>
          </span>
          <textarea
            className="nudge-input"
            rows={2}
            value={form.note ?? ''}
            onChange={(e) => set('note', e.target.value)}
            maxLength={2000}
          />
        </label>

        {error && (
          <p role="alert" className="text-xs font-medium text-[var(--nudge-danger)]">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="submit" className="nudge-btn nudge-btn-primary" disabled={saving}>
            {editing ? 'Save changes' : 'Add reminder'}
          </button>
          {editing && (
            <button
              type="button"
              className="nudge-btn"
              onClick={() => {
                setForm(blank());
                setError(null);
              }}
            >
              Cancel
            </button>
          )}
          <p className="ml-auto text-xs text-[var(--nudge-muted)]">
            {form.time
              ? form.kind === 'meeting'
                ? `Alerts ${data.settings.leadTimes.join(' and ')} minutes before.`
                : 'Alerts at that time.'
              : `No time: alerts at ${data.settings.morningTime} that day.`}
          </p>
        </div>
      </form>

      {sorted.length === 0 ? (
        <p className="px-1 text-xs text-[var(--nudge-muted)]">No manual reminders yet.</p>
      ) : (
        <ul className="nudge-panel divide-y divide-[var(--nudge-border)]">
          {sorted.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Mark ${r.title} done`}
                checked={r.done}
                onChange={(e) => void api.setDone(r.id, e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <div className={`min-w-0 flex-1 ${r.done ? 'text-[var(--nudge-muted)] line-through' : ''}`}>
                <p className="truncate text-sm font-semibold">{r.title}</p>
                <p className="truncate text-xs text-[var(--nudge-muted)]">
                  {[KIND_LABEL[r.kind], formatWhen(manualToItem(r)), r.note].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button type="button" className="nudge-btn !h-7 !px-2.5 !text-xs" onClick={() => edit(r)}>
                Edit
              </button>
              {confirmDelete === r.id ? (
                <button
                  type="button"
                  className="nudge-btn !h-7 !px-2.5 !text-xs !text-[var(--nudge-danger)]"
                  onClick={() => {
                    setConfirmDelete(null);
                    if (form.id === r.id) setForm(blank());
                    void api.delete(r.id);
                  }}
                  onBlur={() => setConfirmDelete(null)}
                >
                  Confirm delete
                </button>
              ) : (
                <button type="button" className="nudge-btn !h-7 !px-2.5 !text-xs" onClick={() => setConfirmDelete(r.id)}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
