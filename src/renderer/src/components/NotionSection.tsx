import { useState } from 'react';
import type { ConnectionTest } from '../../../shared/types';
import type { AppData } from '../hooks/useAppData';

const api = window.nudge.notion;

/**
 * Notion connection settings. The token is write-only: it goes to the main
 * process to be encrypted and is never sent back, so this component only
 * ever knows whether one is saved.
 */
export function NotionSection({ data }: { data: AppData }) {
  const connected = data.sync.hasToken;
  const [token, setToken] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<ConnectionTest | null>(null);

  const runTest = async () => {
    setBusy(true);
    setTest(null);
    setTest(await api.test());
    setBusy(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await api.setToken(token);
    // Drop the token from this page's memory as soon as it is handed over.
    setToken('');
    if (result.ok) {
      setError(null);
      setReplacing(false);
      // Check what the new token can read without another click.
      await runTest();
    } else {
      setError(result.error);
      setBusy(false);
    }
  };

  const remove = async () => {
    await api.clearToken();
    setTest(null);
    setReplacing(false);
  };

  return (
    <section className="nudge-panel p-5">
      <h2 className="text-sm font-semibold">Notion</h2>
      <p className="mt-1 text-xs text-[var(--nudge-muted)]">
        Paste an internal integration token, then share the Meetings database and the Todo List page with that
        integration in Notion.
      </p>

      {connected && !replacing ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="flex items-center gap-2 text-[13px] font-medium">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
            Token saved and encrypted
          </span>
          <button type="button" className="nudge-btn ml-auto" disabled={busy} onClick={() => void runTest()}>
            {busy ? 'Testing…' : 'Test connection'}
          </button>
          <button type="button" className="nudge-btn" onClick={() => setReplacing(true)}>
            Replace
          </button>
          <button type="button" className="nudge-btn" onClick={() => void remove()}>
            Remove
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void save(e)} className="mt-4 flex items-center gap-2">
          <input
            type="password"
            aria-label="Notion token"
            className="nudge-input"
            placeholder="ntn_…"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" className="nudge-btn nudge-btn-primary" disabled={busy || token.trim() === ''}>
            Save token
          </button>
          {replacing && (
            <button type="button" className="nudge-btn" onClick={() => setReplacing(false)}>
              Cancel
            </button>
          )}
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-[var(--nudge-danger)]">
          {error}
        </p>
      )}

      {/* Test result: one line per source, so it is clear which one to share. */}
      {test && (
        <ul role="status" className="mt-4 flex flex-col gap-1.5 border-t border-[var(--nudge-border)] pt-4 text-[13px]">
          {test.error && <li className="text-[var(--nudge-danger)]">{test.error}</li>}
          {test.sources.map((s) => (
            <li key={s.label} className="flex items-baseline gap-2">
              <span className={`w-4 font-bold ${s.ok ? 'text-emerald-400' : 'text-[var(--nudge-danger)]'}`}>
                {s.ok ? '✓' : '✕'}
              </span>
              <span className="w-20 font-medium">{s.label}</span>
              <span className="text-[var(--nudge-muted)]">{s.ok ? 'Can read' : s.error}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
