import { Menu, Tray, nativeImage } from 'electron';
import { resourcePath } from '../paths';

export type TrayHandlers = {
  onOpen: () => void;
  onSyncNow: () => void;
  /** Toggle: pause alerts for one hour, or resume if already paused. */
  onTogglePause: () => void;
  onQuit: () => void;
  /** Epoch ms until which alerts are paused, or 0 when not paused. */
  pausedUntil: () => number;
};

let tray: Tray | null = null;
let handlers: TrayHandlers | null = null;

/** Build the context menu. Rebuilt whenever the pause state changes. */
function buildMenu(h: TrayHandlers): Menu {
  const until = h.pausedUntil();
  const paused = until > Date.now();
  const untilLabel = new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return Menu.buildFromTemplate([
    { label: 'Open', click: h.onOpen },
    { label: 'Sync now', click: h.onSyncNow },
    {
      label: paused ? `Resume alerts (paused until ${untilLabel})` : 'Pause alerts for 1 hour',
      click: h.onTogglePause,
    },
    { type: 'separator' },
    { label: 'Quit', click: h.onQuit },
  ]);
}

/** Create the tray icon. Left click opens the main window. */
export function createTray(h: TrayHandlers): void {
  handlers = h;
  // nativeImage picks up tray@2x.png on high-DPI screens automatically.
  tray = new Tray(nativeImage.createFromPath(resourcePath('tray.png')));
  tray.setToolTip('Nudge');
  tray.setContextMenu(buildMenu(h));
  tray.on('click', h.onOpen);
}

/** Refresh the menu label and tooltip after pausing or resuming. */
export function refreshTray(): void {
  if (!tray || !handlers) return;
  tray.setContextMenu(buildMenu(handlers));
  tray.setToolTip(handlers.pausedUntil() > Date.now() ? 'Nudge (alerts paused)' : 'Nudge');
}
