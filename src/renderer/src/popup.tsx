import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildTheme } from '../../shared/color';
import type { FiredAlert, PopupPayload } from '../../shared/types';
import { PopupCard } from './components/PopupCard';
import { playChime } from './lib/chime';
import './styles.css';

const api = window.nudge.popup;

/**
 * The popup window. The main process owns the list of open alerts and sends
 * it here on every change. This page shows one alert at a time, with a
 * counter and next/previous controls when there are several.
 */
function PopupApp() {
  const [payload, setPayload] = useState<PopupPayload | null>(null);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  /** Mark done errors by alert key. */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /** The alerts last shown. Kept on screen while the fade-out plays. */
  const [lastShown, setLastShown] = useState<{ alerts: FiredAlert[]; index: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastChime = useRef<number | null>(null);

  // Get the current state on load, then listen for changes.
  useEffect(() => {
    void api.ready().then(setPayload);
    return api.onUpdate(setPayload);
  }, []);

  const alerts = payload?.alerts ?? [];
  const open = alerts.length > 0;
  const safeIndex = Math.min(index, Math.max(0, alerts.length - 1));
  const current = alerts[safeIndex];

  // Remember what is on screen so it can fade out after the list empties.
  useEffect(() => {
    if (open) setLastShown({ alerts, index: safeIndex });
  }, [alerts, open, safeIndex]);

  // Each time the popup opens fresh, start at the first alert.
  useEffect(() => {
    if (!open) {
      setIndex(0);
      setErrors({});
    }
  }, [open]);

  // Chime when a new alert arrives (the counter from main went up).
  useEffect(() => {
    if (!payload) return;
    if (lastChime.current !== null && payload.chime !== lastChime.current && payload.sound && open) playChime();
    lastChime.current = payload.chime;
  }, [payload, open]);

  // Keep the headline counting down while the popup stays open.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [open]);

  // Tell main how tall the card is so the window fits it exactly.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const report = () => api.resize(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  });

  // Esc dismisses the current alert. This works once the popup has keyboard
  // focus; it deliberately does not grab focus when it opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && current) api.dismiss(current.key);
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, alerts.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, alerts.length]);

  if (!payload) return null;

  const markDone = async (key: string) => {
    setBusyKey(key);
    setErrors((e) => ({ ...e, [key]: '' }));
    const result = await api.markDone(key);
    setBusyKey(null);
    // On failure the alert stays open with the reason shown inline.
    if (!result.ok) setErrors((e) => ({ ...e, [key]: `Could not mark done: ${result.error}` }));
  };

  // While closing, keep drawing the last alert so it can fade out.
  const shown = open ? { alerts, index: safeIndex } : lastShown;
  const alert = shown?.alerts[shown.index];
  if (!shown || !alert) return null;

  const theme = buildTheme(payload.appearance) as React.CSSProperties;

  return (
    // Padding leaves room for the shadow. With an OS blur backdrop the card
    // fills the window instead.
    <div style={theme} className={payload.osBlur ? '' : 'p-7'}>
      <div
        ref={cardRef}
        // A new key per open restarts the entrance animation.
        key={open ? 'open' : 'closing'}
        className={open ? 'nudge-anim-in' : 'nudge-anim-out'}
        onAnimationEnd={() => {
          if (!open) api.hidden();
        }}
      >
        <PopupCard
          alert={alert}
          now={now}
          index={shown.index}
          count={shown.alerts.length}
          snoozeMinutes={payload.snoozeMinutes}
          error={errors[alert.key] || null}
          busy={busyKey === alert.key}
          flat={payload.osBlur}
          onPrev={() => setIndex(Math.max(safeIndex - 1, 0))}
          onNext={() => setIndex(Math.min(safeIndex + 1, alerts.length - 1))}
          onDismiss={() => api.dismiss(alert.key)}
          onSnooze={(minutes) => api.snooze(alert.key, minutes)}
          onMarkDone={() => void markDone(alert.key)}
          onOpen={() => api.openInNotion(alert.key)}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
