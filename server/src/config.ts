import { readFileSync, watch } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export interface ScreenConfig {
  /** motion/occupancy entity_ids that wake the tablet; empty = every motion/occupancy sensor */
  motionSensors: string[];
  /** minutes with no motion before the screen sleeps; 0 disables sleeping */
  offDelayMinutes: number;
  /** Fully Kiosk Remote Admin (PLUS): server calls the tablet directly */
  fullyHost: string;      // e.g. "192.168.1.60" — empty disables the REST driver
  fullyPassword: string;
}

/**
 * A sidebar room. Membership resolves in order: `entities` → `match` globs →
 * `areaOverrides` → the HA area registry. Anything left over lands in "Other".
 */
export interface RoomDef {
  name: string;
  /** key into the client's icon map; falls back to a generic room icon */
  icon?: string;
  /** exact entity_ids; these always win over any room's globs */
  entities?: string[];
  /** globs against entity_id — `*` matches any run, `?` a single character;
   *  a leading `!` excludes (e.g. "!*hall_bathroom*") */
  match?: string[];
}

/**
 * A fan composed from an on/off entity plus one stateless button per speed
 * (typically an ESPHome IR blaster). State and availability mirror `power`;
 * the speed is whatever was last sent, because IR is one-way.
 */
export interface VirtualFan {
  /** must be in the `fan.` domain so the client renders it as a FanCard */
  entity_id: string;
  name: string;
  room: string;
  power: string;
  speeds: string[];
  /** optional IR power button pressed ~1s after `power` turns on */
  powerButton?: string;
}

export interface DashboardConfig {
  rooms: RoomDef[];
  /** legacy: sidebar order when `rooms` is empty and rooms come from HA areas */
  roomOrder: string[];
  hiddenEntities: string[];
  areaOverrides: Record<string, string>;
  /** entity_id → display name override */
  names: Record<string, string>;
  virtual: VirtualFan[];
  screen: ScreenConfig;
}

const EMPTY: DashboardConfig = {
  rooms: [], roomOrder: [], hiddenEntities: [], areaOverrides: {}, names: {}, virtual: [],
  screen: { motionSensors: [], offDelayMinutes: 5, fullyHost: '', fullyPassword: '' },
};

export const HA_URL = (process.env.HA_URL ?? '').replace(/\/$/, '');
export const HA_TOKEN = process.env.HA_TOKEN ?? '';
export const PORT = Number(process.env.PORT ?? 8080);
export const CONFIG_PATH = resolve(process.env.CONFIG_PATH ?? 'config/dashboard.json');
/** Writable dir for runtime state (virtual-fan speeds). Config may be mounted read-only. */
export const DATA_DIR = resolve(process.env.DATA_DIR ?? dirname(CONFIG_PATH));
/** Extra origins allowed to open /ws, e.g. a reverse proxy's public URL. Same-origin is
 *  always allowed. Normalised, so a pasted "https://Dash.example/" still matches. */
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)
  .flatMap(s => {
    try { return [new URL(s).origin]; }
    catch { console.warn(`ALLOWED_ORIGINS: "${s}" is not a URL; ignored`); return []; }
  });
/** setTimeout holds at most 2^31-1 ms (~24.8 days); anything longer fires after 1 ms. */
const MAX_OFF_DELAY_MINUTES = 35_000;

if (!HA_URL || !HA_TOKEN) {
  console.error('HA_URL and HA_TOKEN must be set (see .env.example)');
  process.exit(1);
}

/* ---------- validation ----------
   The file is hand-edited and hot-reloaded into a running wall panel, so a
   mistake should cost one entry (with a log line), never the whole dashboard. */

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
/** a list of non-empty strings; a lone string is accepted as a list of one */
const strList = (x: unknown): string[] =>
  (Array.isArray(x) ? x : x === undefined ? [] : [x]).filter(isStr);
const strMap = (x: unknown): Record<string, string> =>
  isObj(x) ? Object.fromEntries(Object.entries(x).filter(([, v]) => isStr(v))) as Record<string, string> : {};

function normalize(raw: unknown): DashboardConfig {
  const warn = (msg: string) => console.warn(`dashboard.json: ${msg}`);
  const r = isObj(raw) ? raw : {};

  const rooms: RoomDef[] = [];
  for (const x of Array.isArray(r.rooms) ? r.rooms : []) {
    if (!isObj(x) || !isStr(x.name)) { warn(`room ignored (needs a "name"): ${JSON.stringify(x)}`); continue; }
    const name = x.name.trim();
    if (rooms.some(o => o.name === name)) { warn(`duplicate room "${name}" ignored`); continue; }
    rooms.push({
      name,
      icon: isStr(x.icon) ? x.icon : undefined,
      entities: strList(x.entities),
      match: strList(x.match),
    });
  }
  const roomNames = new Set(rooms.map(o => o.name));
  const outsideRooms = (room: string) => roomNames.size > 0 && !roomNames.has(room);

  const virtual: VirtualFan[] = [];
  for (const x of Array.isArray(r.virtual) ? r.virtual : []) {
    const v = isObj(x) ? x : {};
    const speeds = strList(v.speeds);
    if (!isStr(v.entity_id) || !v.entity_id.startsWith('fan.') || !isStr(v.power) || speeds.length === 0) {
      warn(`virtual entry ignored (needs a fan.* entity_id, power and speeds[]): ${JSON.stringify(x)}`);
      continue;
    }
    if (virtual.some(o => o.entity_id === v.entity_id)) {
      warn(`duplicate virtual ${v.entity_id} ignored`);
      continue;
    }
    const room = isStr(v.room) ? v.room : '';
    if (outsideRooms(room)) warn(`virtual ${v.entity_id}: room "${room}" is not in rooms[], so it shows under Other`);
    virtual.push({
      entity_id: v.entity_id,
      name: isStr(v.name) ? v.name : v.entity_id,
      room,
      power: v.power,
      speeds,
      powerButton: isStr(v.powerButton) ? v.powerButton : undefined,
    });
  }

  const areaOverrides = strMap(r.areaOverrides);
  for (const [id, room] of Object.entries(areaOverrides)) {
    if (outsideRooms(room)) warn(`areaOverrides ${id} → "${room}" is not in rooms[], so it shows under Other`);
  }

  const s = isObj(r.screen) ? r.screen : {};
  let delay = s.offDelayMinutes === undefined ? EMPTY.screen.offDelayMinutes : Number(s.offDelayMinutes);
  if (!Number.isFinite(delay)) {
    warn(`screen.offDelayMinutes must be a number; using ${EMPTY.screen.offDelayMinutes}`);
    delay = EMPTY.screen.offDelayMinutes;
  } else if (delay > MAX_OFF_DELAY_MINUTES) {
    warn(`screen.offDelayMinutes ${delay} is past the timer limit; using ${MAX_OFF_DELAY_MINUTES} (use 0 to never sleep)`);
    delay = MAX_OFF_DELAY_MINUTES;
  }

  return {
    rooms,
    roomOrder: strList(r.roomOrder),
    hiddenEntities: strList(r.hiddenEntities),
    areaOverrides,
    names: strMap(r.names),
    virtual,
    screen: {
      motionSensors: strList(s.motionSensors),
      offDelayMinutes: delay,
      fullyHost: typeof s.fullyHost === 'string' ? s.fullyHost : '',
      fullyPassword: typeof s.fullyPassword === 'string' ? s.fullyPassword : '',
    },
  };
}

/** On a hot-reload, a broken or half-written file keeps `prev` rather than blanking the panel. */
function load(prev?: DashboardConfig): DashboardConfig {
  const fallback = prev ? 'keeping the last good config' : 'using defaults';
  let text: string;
  try {
    text = readFileSync(CONFIG_PATH, 'utf8');
  } catch (err) {
    console.warn(`dashboard.json not readable (${(err as Error).message}); ${fallback}`);
    return prev ?? EMPTY;
  }
  try {
    return normalize(JSON.parse(text));
  } catch (err) {
    console.warn(`dashboard.json is not valid JSON (${(err as Error).message}); ${fallback}`);
    return prev ?? EMPTY;
  }
}

let current: DashboardConfig = load();
const listeners = new Set<(c: DashboardConfig) => void>();

export function dashboardConfig(): DashboardConfig {
  return current;
}

export function onConfigChange(fn: (c: DashboardConfig) => void): void {
  listeners.add(fn);
}

// Hot-reload on edit, debounced — editors fire multiple fs events per save.
// Watch the directory, not the file: atomic-replace editors and Docker bind
// mounts both make a file-level watcher go silent after the first save.
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  watch(dirname(CONFIG_PATH), (_ev, file) => {
    if (file && file !== basename(CONFIG_PATH)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = load(current);
      if (next === current) return; // unreadable or invalid — already logged
      current = next;
      console.log('dashboard.json reloaded');
      // one failing listener must not stop the rest (e.g. the screen timer)
      for (const fn of listeners) {
        try { fn(current); } catch (err) { console.error('config reload listener failed:', (err as Error).message); }
      }
    }, 250);
  });
} catch {
  /* directory may not exist yet; overrides are optional */
}
