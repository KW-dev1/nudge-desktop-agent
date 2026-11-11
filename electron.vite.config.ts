import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// One config for the three build targets: main process, preload script, and
// the React renderer. electron-vite keeps node_modules external for main and
// preload, so only our own code is bundled there.
export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Sandboxed preload scripts cannot be ES modules, so emit CommonJS
        // even though the rest of the project is ESM.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react(), tailwindcss()],
    // Use the IPv4 loopback address, not "localhost". On Windows "localhost"
    // can resolve to IPv6 (::1) for the server and IPv4 for Electron, or the
    // other way round, and the window then loads nothing
    // (ERR_CONNECTION_REFUSED).
    server: { host: '127.0.0.1' },
    build: {
      rollupOptions: {
        // Two pages: the main window and the always-on-top popup.
        input: {
          index: resolve('src/renderer/index.html'),
          popup: resolve('src/renderer/popup.html'),
        },
      },
    },
  },
});
