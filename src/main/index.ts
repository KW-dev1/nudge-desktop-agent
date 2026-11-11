import { app } from 'electron';
import { markQuitting, showMainWindow } from './windows/mainWindow';
import { createTray } from './windows/tray';

// Launched by Windows at login with this flag, so the app starts in the tray
// without opening the main window.
const startHidden = process.argv.includes('--hidden');

// Single instance: a second launch hands over to the first and exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  void app.whenReady().then(() => {
    // Windows uses this ID to group the tray icon and notifications.
    app.setAppUserModelId('com.kennethwebber.nudge');

    createTray({
      onOpen: showMainWindow,
      onSyncNow: () => {},
      onTogglePause: () => {},
      onQuit: () => app.quit(),
      pausedUntil: () => 0,
    });

    if (!startHidden) showMainWindow();
  });

  app.on('before-quit', markQuitting);

  // A tray app has no windows most of the time. Keep running when the last
  // window closes; quitting happens only through the tray menu.
  app.on('window-all-closed', () => {});
}
