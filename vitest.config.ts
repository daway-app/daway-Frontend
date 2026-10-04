import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Keep all scratch files inside the project. The OS temp directory is not
    // writable in every environment, which makes Vitest fail during setup.
    cache: false,
    // Run in a single forked process. Vitest's parallel workers race on the
    // Vite SSR module cache and fail with EPERM on some Windows setups, which
    // shows up as "Unhandled Errors" even though every test passes. One fork
    // removes the race and keeps the suite deterministic.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    env: {
      // The API client resolves a base URL at module load. Tests always pass an
      // explicit `baseUrl`, so this value is only here to satisfy startup.
      VITE_API_BASE_URL: 'https://api.test',
    },
  },
  cacheDir: 'node_modules/.vite',
});
