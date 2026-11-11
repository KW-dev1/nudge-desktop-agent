import { BrowserWindow, shell } from 'electron';
import { preloadPath, rendererEntry, resourcePath } from '../paths';

let win: BrowserWindow | null = null;
// Set right before a real quit so the close handler stops hiding the window.
let quitting = false;

export function markQuitting(): void {
  quitting = true;
}

/** Create the main window once. It starts hidden; the tray opens it. */
function create(): BrowserWindow {
  const w = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: 'Nudge',
    icon: resourcePath('icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Closing only hides the window. The app keeps running in the tray.
  w.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      w.hide();
    }
  });
  w.on('closed', () => {
    win = null;
  });

  // Links clicked in the UI open in the default browser, never in the app.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const entry = rendererEntry('index');
  if (entry.url) void w.loadURL(entry.url);
  else if (entry.file) void w.loadFile(entry.file);
  return w;
}

/** Show the main window, creating it on first use, and bring it to front. */
export function showMainWindow(): void {
  if (!win) win = create();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** The live window, if it exists. Used to push events to the renderer. */
export function getMainWindow(): BrowserWindow | null {
  return win;
}
