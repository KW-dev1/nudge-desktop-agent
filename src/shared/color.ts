// Color math for the popup theme. Pure functions, used by the renderer and
// covered by unit tests.

import type { Appearance } from './types';

export type Rgb = { r: number; g: number; b: number };

/** Parse "#rrggbb". Anything else falls back to a dark slate. */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 17, g: 24, b: 39 };
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) };
}

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Blend two colors. `amount` is how much of `b` to use, from 0 to 1. */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex({
    r: x.r + (y.r - x.r) * amount,
    g: x.g + (y.g - x.g) * amount,
    b: x.b + (y.b - x.b) * amount,
  });
}

/** WCAG relative luminance, from 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colors, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = '#ffffff';
const DARK_TEXT = '#0f172a';

/** White or near-black, whichever reads better on the given background. */
export function readableText(background: string): string {
  return contrast(background, LIGHT_TEXT) >= contrast(background, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/** The CSS variables that style the popup card and the main window. */
export type Theme = {
  '--nudge-bg': string;
  '--nudge-bg-solid': string;
  '--nudge-fg': string;
  '--nudge-muted': string;
  '--nudge-surface': string;
  '--nudge-surface-hover': string;
  '--nudge-border': string;
  '--nudge-accent': string;
  '--nudge-accent-hover': string;
  '--nudge-accent-fg': string;
  '--nudge-accent-text': string;
  '--nudge-danger': string;
  '--nudge-radius': string;
};

/**
 * Derive every color the UI needs from the appearance settings.
 *
 * Only `--nudge-bg` has an alpha channel. Text, icons, and button fills are
 * solid colors mixed from the background and the text color, so they stay
 * fully opaque however see-through the background is.
 */
export function buildTheme(a: Appearance): Theme {
  const { r, g, b } = parseHex(a.background);
  const fg = readableText(a.background);
  const dark = fg === LIGHT_TEXT;
  const opacity = 1 - a.transparency / 100;

  // The accent is used as text too (kind label, headline). If the picked
  // accent is hard to read on this background, nudge it toward the text color.
  let accentText = a.accent;
  for (let i = 0; i < 6 && contrast(accentText, a.background) < 4.5; i++) {
    accentText = mix(accentText, fg, 0.25);
  }

  return {
    '--nudge-bg': `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`,
    '--nudge-bg-solid': a.background,
    '--nudge-fg': fg,
    '--nudge-muted': mix(fg, a.background, 0.35),
    '--nudge-surface': mix(a.background, fg, dark ? 0.14 : 0.08),
    '--nudge-surface-hover': mix(a.background, fg, dark ? 0.22 : 0.14),
    '--nudge-border': mix(a.background, fg, 0.18),
    '--nudge-accent': a.accent,
    '--nudge-accent-hover': mix(a.accent, readableText(a.accent), 0.12),
    '--nudge-accent-fg': readableText(a.accent),
    '--nudge-accent-text': accentText,
    '--nudge-danger': dark ? '#fca5a5' : '#b91c1c',
    '--nudge-radius': `${a.radius}px`,
  };
}
