/**
 * Device role. The wall panel is a "kiosk": it sleeps on the server's motion
 * timer, holds a wake lock and may watch its camera. Phones and laptops are
 * "personal" and must do none of those things — they share one server, so the
 * sleep broadcast reaches them too and would otherwise black out mid-use.
 */
export type DeviceRole = 'kiosk' | 'personal';

const KEY = 'dash-device';
const read = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string): void => {
  try { localStorage.setItem(k, v); } catch { /* private mode */ }
};

// ?device=kiosk|personal records the choice once, then leaves the URL. Left in
// place it would be re-applied on every reload, undoing a change made in Settings.
const params = new URLSearchParams(location.search);
const fromQuery = params.get('device');
if (fromQuery === 'kiosk' || fromQuery === 'personal') write(KEY, fromQuery);
if (params.has('device')) {
  params.delete('device');
  const qs = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

export function deviceRole(): DeviceRole {
  const saved = read(KEY);
  if (saved === 'kiosk' || saved === 'personal') return saved;
  // Nothing chosen yet. PanelKiosk and Fully Kiosk both inject `window.fully`,
  // and camera wake left on from before roles existed also means a wall panel.
  return 'fully' in window || read('dash-cam-wake') === '1' ? 'kiosk' : 'personal';
}

export function setDeviceRole(r: DeviceRole): void {
  write(KEY, r);
  location.reload();
}

export const isKiosk = deviceRole() === 'kiosk';

// No pinch-zoom on the wall panel: a two-finger brush would shift every tap target.
if (isKiosk) {
  document.querySelector('meta[name="viewport"]')?.setAttribute('content',
    'width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1, user-scalable=no');
}
