// Validation for settings. Anything read from disk or sent by the renderer
// passes through here, so the rest of the app can trust the values.

import { DEFAULT_SETTINGS, type Appearance, type Settings } from './types';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A whole number inside [min, max], or the fallback if it is not a number. */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Lead times: whole minutes from 0 to 24 hours, no duplicates, longest first. */
function leadTimes(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    .map((n) => Math.round(n))
    .filter((n) => n >= 0 && n <= 1440);
  const unique = [...new Set(cleaned)].sort((a, b) => b - a).slice(0, 6);
  // An empty list would silently turn off meeting alerts, so keep the default.
  return unique.length > 0 ? unique : fallback;
}

export function normalizeAppearance(input: unknown, base: Appearance = DEFAULT_SETTINGS.appearance): Appearance {
  const a = (input ?? {}) as Partial<Record<keyof Appearance, unknown>>;
  return {
    background: color(a.background, base.background),
    transparency: clampInt(a.transparency, 0, 50, base.transparency),
    radius: clampInt(a.radius, 0, 32, base.radius),
    accent: color(a.accent, base.accent),
    blur: bool(a.blur, base.blur),
  };
}

/**
 * Build valid settings from untrusted input. Missing or invalid fields fall
 * back to `base` (the current settings when applying a patch, or the defaults
 * when reading from disk).
 */
export function normalizeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const s = (input ?? {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    leadTimes: leadTimes(s.leadTimes, base.leadTimes),
    morningTime: typeof s.morningTime === 'string' && HH_MM.test(s.morningTime) ? s.morningTime : base.morningTime,
    snoozeMinutes: clampInt(s.snoozeMinutes, 1, 240, base.snoozeMinutes),
    syncIntervalMinutes: clampInt(s.syncIntervalMinutes, 1, 60, base.syncIntervalMinutes),
    sound: bool(s.sound, base.sound),
    autoDismissSeconds: clampInt(s.autoDismissSeconds, 0, 3600, base.autoDismissSeconds),
    startWithWindows: bool(s.startWithWindows, base.startWithWindows),
    appearance: normalizeAppearance(s.appearance, base.appearance),
  };
}
