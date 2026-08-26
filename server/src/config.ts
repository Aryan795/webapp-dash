import { readFileSync, watch } from 'node:fs';
import { resolve } from 'node:path';

export interface ScreenConfig {
  /** motion/occupancy entity_ids that wake the tablet; empty = every motion/occupancy sensor */
  motionSensors: string[];
  /** minutes with no motion before the screen sleeps; 0 disables sleeping */
  offDelayMinutes: number;
  /** Fully Kiosk Remote Admin (PLUS): server calls the tablet directly */
  fullyHost: string;      // e.g. "192.168.1.60" — empty disables the REST driver
  fullyPassword: string;
}

export interface DashboardConfig {
  roomOrder: string[];
  hiddenEntities: string[];
  areaOverrides: Record<string, string>;
  names: Record<string, string>;
  screen: ScreenConfig;
}

const EMPTY: DashboardConfig = {
  roomOrder: [], hiddenEntities: [], areaOverrides: {}, names: {},
  screen: { motionSensors: [], offDelayMinutes: 5, fullyHost: '', fullyPassword: '' },
};

export const HA_URL = (process.env.HA_URL ?? '').replace(/\/$/, '');
export const HA_TOKEN = process.env.HA_TOKEN ?? '';
export const PORT = Number(process.env.PORT ?? 8080);
export const CONFIG_PATH = resolve(process.env.CONFIG_PATH ?? 'config/dashboard.json');

if (!HA_URL || !HA_TOKEN) {
  console.error('HA_URL and HA_TOKEN must be set (see .env.example)');
  process.exit(1);
}

let current: DashboardConfig = load();
const listeners = new Set<(c: DashboardConfig) => void>();

function load(): DashboardConfig {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return { ...EMPTY, ...raw, screen: { ...EMPTY.screen, ...(raw.screen ?? {}) } };
  } catch (err) {
    console.warn(`dashboard.json not readable (${(err as Error).message}); using defaults`);
    return EMPTY;
  }
}

export function dashboardConfig(): DashboardConfig {
  return current;
}

export function onConfigChange(fn: (c: DashboardConfig) => void): void {
  listeners.add(fn);
}

// Hot-reload on edit, debounced — editors fire multiple fs events per save.
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  watch(CONFIG_PATH, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      current = load();
      console.log('dashboard.json reloaded');
      for (const fn of listeners) fn(current);
    }, 250);
  });
} catch {
  /* file may not exist yet; overrides are optional */
}
