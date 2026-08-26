import { create } from 'zustand';
import { socket } from '../lib/socket';
import { CameraMotion, type CamStatus, type Sensitivity } from '../lib/motioncam';
import type { Entity, HaStatus, ServerMessage } from '../types';
import { domainOf, UNASSIGNED } from '../types';

/** Display order of domains inside a room grid. */
const DOMAIN_ORDER = [
  'climate', 'fan', 'light', 'switch', 'input_boolean', 'cover', 'media_player',
  'camera', 'script', 'number', 'select', 'counter', 'sensor', 'binary_sensor',
];
const rank = (d: string) => {
  const i = DOMAIN_ORDER.indexOf(d);
  return i === -1 ? DOMAIN_ORDER.length : i;
};

export const isUnavailable = (e: Entity) => e.state === 'unavailable' || e.state === 'unknown';

interface DashState {
  ready: boolean;
  link: boolean;           // socket to server up
  haStatus: HaStatus;      // server's link to HA
  rooms: string[];
  entities: Record<string, Entity>;
  room: string;            // selected room; 'home' = glance view
  hideUnavailable: boolean;
  theme: string;
  reduceFx: boolean;
  screen: 'awake' | 'asleep';
  camWake: boolean;
  camSensitivity: Sensitivity;
  camStatus: CamStatus;

  setRoom: (r: string) => void;
  setTheme: (t: string) => void;
  setHideUnavailable: (v: boolean) => void;
  setReduceFx: (v: boolean) => void;
  setCamWake: (v: boolean) => void;
  setCamSensitivity: (v: Sensitivity) => void;
  callService: (domain: string, service: string, entity_id?: string,
    service_data?: Record<string, unknown>, optimistic?: Partial<Entity>) => void;
}

const revertTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useDash = create<DashState>((set, get) => ({
  ready: false,
  link: false,
  haStatus: 'reconnecting',
  rooms: [],
  entities: {},
  room: 'home',
  hideUnavailable: localStorage.getItem('dash-hide-unavail') === '1',
  theme: localStorage.getItem('dash-theme') ?? 'gruvbox',
  reduceFx: localStorage.getItem('dash-reduce-fx') === '1',
  screen: 'awake',
  camWake: localStorage.getItem('dash-cam-wake') === '1',
  camSensitivity: (localStorage.getItem('dash-cam-sens') as Sensitivity) ?? 'medium',
  camStatus: 'off',

  setRoom: (room) => set({ room }),
  setTheme: (theme) => {
    localStorage.setItem('dash-theme', theme);
    set({ theme });
  },
  setHideUnavailable: (v) => {
    localStorage.setItem('dash-hide-unavail', v ? '1' : '0');
    set({ hideUnavailable: v });
  },
  setReduceFx: (v) => {
    localStorage.setItem('dash-reduce-fx', v ? '1' : '0');
    set({ reduceFx: v });
  },
  setCamWake: (v) => {
    localStorage.setItem('dash-cam-wake', v ? '1' : '0');
    set({ camWake: v });
    if (v) void cam.start(); else cam.stop();
  },
  setCamSensitivity: (v) => {
    localStorage.setItem('dash-cam-sens', v);
    cam.sensitivity = v;
    set({ camSensitivity: v });
  },

  callService: (domain, service, entity_id, service_data, optimistic) => {
    socket.callService(domain, service, entity_id, service_data);
    if (entity_id && optimistic) {
      const cur = get().entities[entity_id];
      if (!cur) return;
      set(s => ({ entities: { ...s.entities, [entity_id]: { ...cur, ...optimistic, pending: true } } }));
      // Revert the optimistic state if HA doesn't confirm within 2.5 s.
      clearTimeout(revertTimers.get(entity_id));
      revertTimers.set(entity_id, setTimeout(() => {
        const now = get().entities[entity_id];
        if (now?.pending) set(s => ({ entities: { ...s.entities, [entity_id]: { ...cur, pending: false } } }));
      }, 2500));
    }
  },
}));

function onMessage(msg: ServerMessage): void {
  const set = useDash.setState;
  switch (msg.type) {
    case 'snapshot': {
      const entities: Record<string, Entity> = {};
      for (const e of msg.entities) entities[e.entity_id] = e;
      set({ ready: true, haStatus: msg.haStatus, rooms: msg.rooms, entities });
      return;
    }
    case 'state_changed': {
      clearTimeout(revertTimers.get(msg.entity.entity_id));
      set(s => ({ entities: { ...s.entities, [msg.entity.entity_id]: msg.entity } }));
      return;
    }
    case 'removed':
      set(s => {
        const { [msg.entity_id]: _gone, ...rest } = s.entities;
        return { entities: rest };
      });
      return;
    case 'ha_status':
      set({ haStatus: msg.status });
      return;
    case 'screen':
      set({ screen: msg.state });
      applyScreen(msg.state);
      return;
  }
}

/** Fully Kiosk JS API bridge (available when running inside Fully with the
 *  JavaScript interface enabled). Falls back to the dim overlay otherwise. */
interface FullyApi {
  turnScreenOn(): void;
  turnScreenOff(keepAlive?: boolean): void;
  setScreenBrightness(v: number): void;
}
const fully = (): FullyApi | undefined => (window as { fully?: FullyApi }).fully;

function applyScreen(state: 'awake' | 'asleep'): void {
  const f = fully();
  if (state === 'asleep') f?.turnScreenOff(true);
  else f?.turnScreenOn();
}

export function wakeScreen(reason: 'tap' | 'camera' = 'tap'): void {
  socket.screenWake(reason);
  useDash.setState({ screen: 'awake' });
  fully()?.turnScreenOn();
}

/* ---------- camera motion wake ---------- */
export const cam = new CameraMotion();
cam.sensitivity = (localStorage.getItem('dash-cam-sens') as Sensitivity) ?? 'medium';
cam.onStatus = (s) => useDash.setState({ camStatus: s });
let lastCamWake = 0;
cam.onMotion = () => {
  const now = Date.now();
  if (now - lastCamWake < 5000) return; // also keeps an occupied room's panel awake
  lastCamWake = now;
  wakeScreen('camera');
};
// lighting shifts when the screen sleeps/wakes must not read as motion
useDash.subscribe((s, prevS) => { if (s.screen !== prevS.screen) cam.rebaseline(); });
if (localStorage.getItem('dash-cam-wake') === '1') void cam.start();
// debug/testing hook
(window as unknown as Record<string, unknown>).__dashCam = cam;

// PanelKiosk (our native Android wrapper) dispatches these when ITS camera
// sees motion or the panel is tapped awake — forward to the server so the
// idle timer restarts. The native side has already lit the screen.
window.addEventListener('kiosk-motion', () => wakeScreen('camera'));
window.addEventListener('kiosk-wake', () => wakeScreen('tap'));

socket.onLink = (up) => useDash.setState({ link: up });
socket.start(onMessage);

// ---------- selectors ----------

export function entitiesForRoom(all: Record<string, Entity>, room: string, hideUnavail: boolean): Entity[] {
  const list = Object.values(all).filter(e => (e.area ?? UNASSIGNED) === room);
  return sortForGrid(list, hideUnavail);
}

export function sortForGrid(list: Entity[], hideUnavail: boolean): Entity[] {
  const filtered = hideUnavail ? list.filter(e => !isUnavailable(e)) : list;
  return filtered.sort((a, b) => {
    const ua = isUnavailable(a) ? 1 : 0, ub = isUnavailable(b) ? 1 : 0;
    if (ua !== ub) return ua - ub;
    const ra = rank(domainOf(a.entity_id)), rb = rank(domainOf(b.entity_id));
    if (ra !== rb) return ra - rb;
    return a.entity_id.localeCompare(b.entity_id);
  });
}

const ACTIVE_STATES = new Set(['on', 'playing', 'cool', 'heat', 'dry', 'fan_only', 'auto', 'open']);
export const isActive = (e: Entity) => ACTIVE_STATES.has(e.state);

export function activeNow(all: Record<string, Entity>): Entity[] {
  return sortForGrid(Object.values(all).filter(e =>
    isActive(e) && ['light', 'switch', 'fan', 'media_player', 'climate', 'cover'].includes(domainOf(e.entity_id))
  ), true);
}
