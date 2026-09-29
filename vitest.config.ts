import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['src/**/*.integration.{test,spec}.{ts,tsx}', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
