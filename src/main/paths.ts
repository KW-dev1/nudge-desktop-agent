import { app } from 'electron';
import { join } from 'node:path';

/**
 * Absolute path to a file in the bundled `resources/` folder (tray icon, app
 * icon). `app.getAppPath()` is the project root in dev and the asar root in a
 * packaged build, so the same call works in both.
 */
export function resourcePath(name: string): string {
  return join(app.getAppPath(), 'resources', name);
}

/** Path to the compiled preload script that sits next to the main bundle. */
export function preloadPath(): string {
  return join(import.meta.dirname, '../preload/index.cjs');
}

/**
 * Load one of the renderer pages into a window. In dev the Vite server serves
 * the page (with hot reload); in a build the page is a file on disk.
 */
export function rendererEntry(page: 'index' | 'popup'): { url?: string; file?: string } {
  const devServer = process.env['ELECTRON_RENDERER_URL'];
  if (devServer) return { url: `${devServer}/${page}.html` };
  return { file: join(import.meta.dirname, `../renderer/${page}.html`) };
}
