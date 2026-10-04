import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // NOTE: no proxy is configured on purpose. The React app talks to the
    // Laravel API directly via VITE_API_BASE_URL, so that CORS behaviour is
    // exercised for real instead of being masked by a dev proxy.
  },
});
