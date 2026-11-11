import { defineConfig } from 'vitest/config';

// Unit tests cover pure logic only (scheduler, Notion mapping, helpers), so a
// plain Node environment is enough. No Electron or DOM is loaded.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
