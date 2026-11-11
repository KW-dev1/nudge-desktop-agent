import { describe, expect, it } from 'vitest';
import { buildTheme, contrast, mix, parseHex, readableText } from '../src/shared/color';
import { DEFAULT_APPEARANCE } from '../src/shared/types';

describe('color helpers', () => {
  it('parses hex colors', () => {
    expect(parseHex('#6366f1')).toEqual({ r: 99, g: 102, b: 241 });
  });

  it('mixes two colors', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#112233', '#ffffff', 0)).toBe('#112233');
  });

  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});

describe('automatic text color (section 7)', () => {
  it('uses light text on dark backgrounds', () => {
    expect(readableText('#111827')).toBe('#ffffff');
    expect(readableText('#1e3a8a')).toBe('#ffffff');
  });

  it('uses dark text on light backgrounds', () => {
    expect(readableText('#ffffff')).toBe('#0f172a');
    expect(readableText('#fde68a')).toBe('#0f172a');
  });

  it('stays readable (4.5:1 or better) across a spread of backgrounds', () => {
    for (const bg of ['#000000', '#111827', '#7f1d1d', '#2563eb', '#16a34a', '#f59e0b', '#e5e7eb', '#ffffff']) {
      expect(contrast(bg, readableText(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('theme', () => {
  it('applies transparency to the background only', () => {
    const theme = buildTheme(DEFAULT_APPEARANCE);
    // 25% transparent means 75% opaque.
    expect(theme['--nudge-bg']).toBe('rgba(17, 24, 39, 0.75)');
    // Everything else is a solid hex color.
    for (const [name, value] of Object.entries(theme)) {
      if (name === '--nudge-bg' || name === '--nudge-radius') continue;
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('follows the transparency and radius settings', () => {
    const theme = buildTheme({ ...DEFAULT_APPEARANCE, transparency: 0, radius: 8 });
    expect(theme['--nudge-bg']).toBe('rgba(17, 24, 39, 1.00)');
    expect(theme['--nudge-radius']).toBe('8px');
  });

  it('switches text color with the background', () => {
    expect(buildTheme({ ...DEFAULT_APPEARANCE, background: '#f8fafc' })['--nudge-fg']).toBe('#0f172a');
    expect(buildTheme(DEFAULT_APPEARANCE)['--nudge-fg']).toBe('#ffffff');
  });

  it('keeps accent-colored text readable when the accent is close to the background', () => {
    const theme = buildTheme({ ...DEFAULT_APPEARANCE, background: '#1e1b4b', accent: '#312e81' });
    expect(contrast(theme['--nudge-accent-text'], '#1e1b4b')).toBeGreaterThanOrEqual(4.5);
  });

  it('picks readable text for accent buttons', () => {
    expect(buildTheme({ ...DEFAULT_APPEARANCE, accent: '#fde047' })['--nudge-accent-fg']).toBe('#0f172a');
  });
});
