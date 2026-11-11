import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '../src/shared/settings';
import { DEFAULT_SETTINGS } from '../src/shared/types';

describe('settings validation', () => {
  it('matches the defaults in the spec (section 9)', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      leadTimes: [60, 30],
      morningTime: '09:00',
      snoozeMinutes: 10,
      syncIntervalMinutes: 2,
      sound: true,
      autoDismissSeconds: 0,
      startWithWindows: true,
      appearance: { transparency: 25, radius: 20 },
    });
  });

  it('falls back to defaults for missing or broken input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ morningTime: '25:99', snoozeMinutes: 'ten' })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps transparency within 0 to 50 and radius within 0 to 32', () => {
    const s = normalizeSettings({ appearance: { transparency: 80, radius: -5 } });
    expect(s.appearance.transparency).toBe(50);
    expect(s.appearance.radius).toBe(0);
  });

  it('rejects colors that are not #rrggbb', () => {
    const s = normalizeSettings({ appearance: { background: 'red', accent: '#ABCDEF' } });
    expect(s.appearance.background).toBe(DEFAULT_SETTINGS.appearance.background);
    expect(s.appearance.accent).toBe('#abcdef');
  });

  it('cleans lead times: unique, whole minutes, longest first', () => {
    expect(normalizeSettings({ leadTimes: [15, 60, 15, -3, 5.4] }).leadTimes).toEqual([60, 15, 5]);
  });

  it('does not allow an empty lead time list', () => {
    expect(normalizeSettings({ leadTimes: [] }).leadTimes).toEqual([60, 30]);
  });

  it('keeps current values for fields a patch leaves out', () => {
    const current = { ...DEFAULT_SETTINGS, sound: false, snoozeMinutes: 5 };
    const next = normalizeSettings({ ...current, morningTime: '08:00' }, current);
    expect(next).toMatchObject({ sound: false, snoozeMinutes: 5, morningTime: '08:00' });
  });
});
