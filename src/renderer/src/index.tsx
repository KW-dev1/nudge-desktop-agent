import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildTheme, readableText } from '../../shared/color';
import { NotionSection } from './components/NotionSection';
import { RemindersTab } from './components/RemindersTab';
import { SettingsTab } from './components/SettingsTab';
import { SyncFooter } from './components/SyncFooter';
import { UpcomingTab } from './components/UpcomingTab';
import { useAppData } from './hooks/useAppData';
import './styles.css';

const TABS = ['Upcoming', 'Reminders', 'Settings'] as const;
type Tab = (typeof TABS)[number];

/**
 * The main window, opened from the tray. It shares the popup's colors,
 * accent, and corner radius so both feel like one app. The window itself is
 * never see-through; transparency applies to the popup only.
 */
function MainApp() {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>('Upcoming');
  if (!data) return null;

  const appearance = data.settings.appearance;
  const theme = buildTheme({ ...appearance, transparency: 0 }) as React.CSSProperties;
  // Make native date, time, and color pickers match the background.
  const scheme = readableText(appearance.background) === '#ffffff' ? 'dark' : 'light';

  return (
    <div style={{ ...theme, colorScheme: scheme }} className="nudge-app flex h-full flex-col">
      <header className="flex items-center gap-6 border-b border-[var(--nudge-border)] px-6 py-3">
        <h1 className="text-base font-bold tracking-tight">Nudge</h1>
        <nav role="tablist" aria-label="Sections" className="flex gap-1">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
              className={`h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
                tab === name
                  ? 'bg-[var(--nudge-accent)] text-[var(--nudge-accent-fg)]'
                  : 'text-[var(--nudge-muted)] hover:bg-[var(--nudge-surface)] hover:text-[var(--nudge-fg)]'
              }`}
            >
              {name}
            </button>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-6 py-6">
          {tab === 'Upcoming' && <UpcomingTab data={data} />}
          {tab === 'Reminders' && <RemindersTab data={data} />}
          {tab === 'Settings' && (
            <SettingsTab data={data}>
              <NotionSection data={data} />
            </SettingsTab>
          )}
        </div>
      </main>

      <SyncFooter data={data} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MainApp />
  </StrictMode>,
);
