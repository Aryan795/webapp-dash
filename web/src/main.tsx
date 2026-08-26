import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Keep the wall panel awake (best-effort; needs user gesture on some browsers).
async function wakeLock() {
  try {
    if ('wakeLock' in navigator) {
      const lock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void wakeLock();

// App-shell cache: a server or HA restart must never white-screen the wall panel.
if ('serviceWorker' in navigator && !location.hostname.includes('localhost-dev')) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
      }, { once: true });
      lock.addEventListener('release', () => setTimeout(() => void wakeLock(), 1000));
    }
  } catch { /* not fatal on a desk browser */ }
}
void wakeLock();

// App-shell cache: a server or HA restart must never white-screen the wall panel.
if ('serviceWorker' in navigator && !location.hostname.includes('localhost-dev')) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
