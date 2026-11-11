import { BrowserWindow, screen, type Display } from 'electron';
import { release } from 'node:os';
import type { FiredAlert, PopupPayload, Settings } from '../../shared/types';
import { preloadPath, rendererEntry } from '../paths';

/** Width of the popup card in px. */
const CARD_WIDTH = 440;
/** Transparent space around the card so its soft shadow is not clipped. */
const SHADOW_MARGIN = 28;
/** How long the renderer gets to play its fade-out before the window hides. */
const CLOSE_FALLBACK_MS = 400;

let win: BrowserWindow | null = null;
let getSettings: () => Settings;
let alerts: FiredAlert[] = [];
let chime = 0;
/** Card height last reported by the renderer. */
let cardHeight = 280;
/** The screen the popup is on. Chosen when it opens, kept while it is open. */
let display: Display | null = null;
/** Whether the current window was created with an OS blur backdrop. */
let windowHasBlur = false;
let hideTimer: NodeJS.Timeout | null = null;

/**
 * True when the OS can blur what is behind a window: Windows 11 22H2 or
 * newer (acrylic) and macOS (vibrancy). Everywhere else the popup falls back
 * to plain transparency.
 */
export function osBlurSupported(): boolean {
  if (process.platform === 'darwin') return true;
  if (process.platform !== 'win32') return false;
  const build = Number(release().split('.')[2] ?? 0);
  return build >= 22621;
}

function wantBlur(): boolean {
  return getSettings().appearance.blur && osBlurSupported();
}

function payload(): PopupPayload {
  const s = getSettings();
  return {
    alerts,
    appearance: s.appearance,
    sound: s.sound,
    snoozeMinutes: s.snoozeMinutes,
    chime,
    osBlur: windowHasBlur,
  };
}

function create(): BrowserWindow {
  windowHasBlur = wantBlur();
  const w = new BrowserWindow({
    width: CARD_WIDTH + SHADOW_MARGIN * 2,
    height: cardHeight + SHADOW_MARGIN * 2,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    // A blurred backdrop is drawn by the OS behind the whole window, so that
    // window is opaque to the compositor and the tint comes from CSS. Without
    // blur the window itself is transparent and only the card is painted.
    transparent: !windowHasBlur,
    backgroundColor: '#00000000',
    ...(windowHasBlur && process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
    ...(windowHasBlur && process.platform === 'darwin'
      ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const }
      : {}),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The chime plays when an alert arrives, with no click to unlock audio.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  // Stay above full-screen apps and other always-on-top windows.
  w.setAlwaysOnTop(true, 'screen-saver');
  w.on('closed', () => {
    win = null;
  });

  const entry = rendererEntry('popup');
  if (entry.url) void w.loadURL(entry.url);
  else if (entry.file) void w.loadFile(entry.file);
  return w;
}

/** Size the window to the card and center it on the chosen screen. */
function place(): void {
  if (!win || !display) return;
  const margin = windowHasBlur ? 0 : SHADOW_MARGIN;
  const width = CARD_WIDTH + margin * 2;
  const height = Math.round(cardHeight) + margin * 2;
  const area = display.workArea;
  win.setBounds({
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  });
}

function send(): void {
  if (win && !win.webContents.isLoading()) win.webContents.send('popup:update', payload());
}

/**
 * Create the popup window ahead of time, hidden, so the first alert appears
 * without a loading delay.
 */
export function initPopup(settings: () => Settings): void {
  getSettings = settings;
  win = create();
}

/** Replace the open alerts. An empty list closes the popup. */
export function setPopupAlerts(next: FiredAlert[], isNew: boolean): void {
  const wasOpen = alerts.length > 0;
  alerts = next;
  if (isNew) chime += 1;
  if (!win) win = create();

  if (alerts.length > 0) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (!wasOpen || !win.isVisible()) {
      // Open on the screen that has the mouse cursor right now.
      display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      place();
      // showInactive: appear without taking keyboard focus from the app the
      // user is typing in.
      win.showInactive();
    }
    send();
    return;
  }

  // Empty: tell the renderer to fade out. It calls popupHidden() when the
  // animation ends; the timer is a safety net in case it never does.
  send();
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(popupHidden, CLOSE_FALLBACK_MS);
}

/** The renderer finished its fade-out. Hide the window if still empty. */
export function popupHidden(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  if (alerts.length === 0) win?.hide();
}

/** The renderer measured the card. Resize the window to fit it. */
export function popupResized(height: number): void {
  if (!Number.isFinite(height) || height < 80 || height > 1200) return;
  cardHeight = height;
  if (alerts.length > 0) place();
}

/** State for a popup page that just loaded. */
export function popupPayload(): PopupPayload {
  return payload();
}

/**
 * Settings changed. Push the new look to an open popup. The blur backdrop
 * can only be chosen when a window is created, so if that setting flipped,
 * rebuild the window while it is not on screen.
 */
export function refreshPopupSettings(): void {
  if (win && wantBlur() !== windowHasBlur && alerts.length === 0) {
    win.destroy();
    win = create();
    return;
  }
  send();
}
