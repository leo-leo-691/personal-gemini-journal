import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Transform JSX in *.tsx test files (the app itself uses jsx: "preserve" via
  // the Next compiler; vitest needs an explicit runtime). Per-file
  // `// @vitest-environment jsdom` opts component tests into a DOM; the default
  // stays node so every existing server-side test is unaffected.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
