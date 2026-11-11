import { useEffect, useState } from 'react';
import { buildTheme } from '../../../shared/color';
import { DEFAULT_APPEARANCE, POPUP_CARD_WIDTH, type Appearance, type FiredAlert } from '../../../shared/types';
import type { AppData } from '../hooks/useAppData';
import { PopupCard } from './PopupCard';

/** A titled block of settings. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="nudge-panel p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-xs text-[var(--nudge-muted)]">{hint}</p>}
      <div className="mt-4 flex flex-col divide-y divide-[var(--nudge-border)]">{children}</div>
    </section>
  );
}

/** One setting: label and help text on the left, the control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-h-[52px] items-center justify-between gap-6 py-2.5">
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        {hint && <span className="block text-xs text-[var(--nudge-muted)]">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">{children}</span>
    </label>
  );
}

/** An on/off switch. */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-[var(--nudge-accent)]' : 'bg-[var(--nudge-border)]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

/**
 * A number box that only saves a valid value. Typing is free-form; the
 * setting changes when the field loses focus or Enter is pressed.
 */
function NumberField(props: { value: number; min: number; max: number; unit: string; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(props.value));
  useEffect(() => setText(String(props.value)), [props.value]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (text.trim() !== '' && Number.isFinite(n)) props.onChange(Math.min(props.max, Math.max(props.min, n)));
    else setText(String(props.value));
  };
  return (
    <>
      <input
        className="nudge-input !w-20 text-right tabular-nums"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="w-14 text-xs text-[var(--nudge-muted)]">{props.unit}</span>
    </>
  );
}

/** Lead times as a comma-separated list, for example "60, 30". */
function LeadTimesField({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value]);
  const commit = () => {
    const parsed = text
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (parsed.length > 0) onChange(parsed);
    else setText(value.join(', '));
  };
  return (
    <>
      <input
        className="nudge-input !w-28 text-right tabular-nums"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="w-14 text-xs text-[var(--nudge-muted)]">minutes</span>
    </>
  );
}

/** A color swatch that opens the system color picker, with the hex next to it. */
function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <span className="text-xs tabular-nums text-[var(--nudge-muted)]">{value.toUpperCase()}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-11 cursor-pointer rounded-lg border border-[var(--nudge-border)] bg-transparent p-0.5"
      />
    </>
  );
}

function Slider(props: { value: number; min: number; max: number; unit: string; onChange: (n: number) => void }) {
  return (
    <>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-44"
      />
      <span className="w-12 text-right text-xs tabular-nums text-[var(--nudge-muted)]">
        {props.value}
        {props.unit}
      </span>
    </>
  );
}

/** A sample alert for the live preview. */
function sampleAlert(now: number): FiredAlert {
  const eventAt = now + 30 * 60_000;
  return {
    key: 'preview',
    item: {
      id: 'preview',
      source: 'notion-task',
      kind: 'meeting',
      title: 'Client check-in with Ana',
      start: new Date(eventAt).toISOString(),
      hasTime: true,
      done: false,
      client: 'Ana',
      with: 'Ana, John',
      type: 'Client check-in',
      url: 'https://www.notion.so',
    },
    alertKind: 'lead-30',
    eventAt,
    headline: 'Meeting in 30 minutes',
    firedAt: now,
  };
}

/**
 * The popup card drawn with the current appearance settings. It sits on a
 * busy backdrop so the transparency setting is visible while adjusting.
 */
function LivePreview({ appearance, snoozeMinutes }: { appearance: Appearance; snoozeMinutes: number }) {
  const [now] = useState(() => Date.now());
  return (
    <div
      aria-label="Popup preview"
      className="flex justify-center overflow-hidden rounded-xl px-4 py-8"
      style={{
        // A stand-in for "whatever is on your desktop".
        background:
          'repeating-linear-gradient(135deg, rgba(255,255,255,.14) 0 14px, transparent 14px 28px), linear-gradient(120deg, #0ea5e9, #a855f7 55%, #f97316)',
      }}
    >
      {/* The preview is for looking, not clicking. */}
      <div style={{ ...(buildTheme(appearance) as React.CSSProperties), width: POPUP_CARD_WIDTH }} className="pointer-events-none">
        <PopupCard alert={sampleAlert(now)} now={now} index={0} count={3} snoozeMinutes={snoozeMinutes} />
      </div>
    </div>
  );
}

/** Settings: alert timing, behavior, and the popup look with a live preview. */
export function SettingsTab({ data, children }: { data: AppData; children?: React.ReactNode }) {
  const { settings: s, updateSettings: update } = data;
  const a = s.appearance;
  const [blurSupported, setBlurSupported] = useState(true);
  useEffect(() => void window.nudge.settings.blurSupported().then(setBlurSupported), []);

  return (
    <div className="flex flex-col gap-6">
      {/* The Notion section is passed in, so it can be added on its own. */}
      {children}

      <Section title="Alerts">
        <Row label="Meeting lead times" hint="One alert at each lead time before a meeting starts.">
          <LeadTimesField value={s.leadTimes} onChange={(leadTimes) => update({ leadTimes })} />
        </Row>
        <Row label="Morning time" hint="When to alert for items that have a date but no time.">
          <input
            type="time"
            className="nudge-input !w-32"
            value={s.morningTime}
            onChange={(e) => e.target.value && update({ morningTime: e.target.value })}
          />
        </Row>
        <Row label="Snooze length" hint="Used by the main Snooze button.">
          <NumberField value={s.snoozeMinutes} min={1} max={240} unit="minutes" onChange={(n) => update({ snoozeMinutes: n })} />
        </Row>
        <Row label="Sync interval" hint="How often to check Notion for changes.">
          <NumberField
            value={s.syncIntervalMinutes}
            min={1}
            max={60}
            unit="minutes"
            onChange={(n) => update({ syncIntervalMinutes: n })}
          />
        </Row>
        <Row label="Sound" hint="Play a short chime when a popup opens.">
          <Toggle checked={s.sound} onChange={(sound) => update({ sound })} />
        </Row>
        <Row label="Auto-dismiss" hint="Close a popup by itself after a while. Off keeps it open until you act.">
          {s.autoDismissSeconds > 0 && (
            <NumberField
              value={s.autoDismissSeconds}
              min={5}
              max={3600}
              unit="seconds"
              onChange={(n) => update({ autoDismissSeconds: n })}
            />
          )}
          <Toggle
            checked={s.autoDismissSeconds > 0}
            onChange={(on) => update({ autoDismissSeconds: on ? 60 : 0 })}
          />
        </Row>
        <Row label="Start with Windows" hint="Launch hidden in the tray when you sign in.">
          <Toggle checked={s.startWithWindows} onChange={(startWithWindows) => update({ startWithWindows })} />
        </Row>
      </Section>

      <Section title="Appearance" hint="Changes show in the preview right away and apply to the next popup.">
        <div className="pb-4">
          <LivePreview appearance={a} snoozeMinutes={s.snoozeMinutes} />
        </div>
        <Row label="Background color">
          <ColorField value={a.background} onChange={(background) => update({ appearance: { background } })} />
        </Row>
        <Row label="Transparency" hint="Only the background is see-through. Text and buttons stay solid.">
          <Slider value={a.transparency} min={0} max={50} unit="%" onChange={(transparency) => update({ appearance: { transparency } })} />
        </Row>
        <Row label="Corner radius">
          <Slider value={a.radius} min={0} max={32} unit="px" onChange={(radius) => update({ appearance: { radius } })} />
        </Row>
        <Row label="Accent color">
          <ColorField value={a.accent} onChange={(accent) => update({ appearance: { accent } })} />
        </Row>
        <Row
          label="Blur behind the popup"
          hint={
            blurSupported
              ? 'Uses the system blur. The system then draws the corners, so the radius setting is ignored.'
              : 'Not supported on this system. The popup uses plain transparency.'
          }
        >
          <Toggle checked={a.blur && blurSupported} disabled={!blurSupported} onChange={(blur) => update({ appearance: { blur } })} />
        </Row>
        <div className="flex gap-2 pt-4">
          <button type="button" className="nudge-btn" onClick={() => window.nudge.popup.showSample()}>
            Show a test popup
          </button>
          <button type="button" className="nudge-btn" onClick={() => update({ appearance: DEFAULT_APPEARANCE })}>
            Reset to defaults
          </button>
        </div>
      </Section>
    </div>
  );
}
