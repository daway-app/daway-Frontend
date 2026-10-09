import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { registerServiceWorker } from './pwa';
import { bumpPageViews } from './lib/pushPermission';
import './styles/global.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('[main] #root element was not found in index.html');
}

// Record one app load for the push-banner usage signal (see
// lib/pushPermission.ts). Safe: the helper swallows storage errors.
bumpPageViews();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA — production only (see src/pwa.ts). No-op in dev so the Vite dev server
// is never intercepted by a service worker.
registerServiceWorker();
