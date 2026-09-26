import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isKiosk } from './lib/device';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Keep the wall panel awake (best-effort; needs a user gesture on some browsers).
// Kiosk only — a phone or laptop should be allowed to sleep normally.
async function wakeLock() {
  try {
    if (!('wakeLock' in navigator)) return;
    const lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => setTimeout(() => void wakeLock(), 1000));
  } catch { /* not fatal on a desk browser */ }
}
if (isKiosk) {
  void wakeLock();
  // the lock is dropped whenever the tab is hidden, so re-take it on return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void wakeLock();
  });
}

// App-shell cache: a server or HA restart must never white-screen the wall panel.
if ('serviceWorker' in navigator && !location.hostname.includes('localhost-dev')) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
