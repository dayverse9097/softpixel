import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false, // never publish source maps with the production site
  },
  server: {
    port: 5173,
    allowedHosts: ['.app.github.dev'], // lets GitHub Codespaces open the dev server
    // In development the API looks same-origin, so the strict session cookie works without extra setup.
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
