import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HaClient } from './ha-client.ts';
import { DATA_DIR, dashboardConfig, onConfigChange, type VirtualFan } from './config.ts';

export interface Entity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  area: string | null;
  last_changed?: string;
}

interface RegistryEntry {
  entity_id: string;
  area_id: string | null;
  device_id: string | null;
  platform: string;
  hidden_by: string | null;
  disabled_by: string | null;
  entity_category: string | null;
}

/** Domains that never belong on a wall panel. */
const NOISE_DOMAINS = new Set([
  'update', 'automation', 'button', 'event', 'tag', 'tts', 'stt', 'conversation',
  'zone', 'person', 'device_tracker', 'todo', 'notify', 'schedule', 'sun',
]);

const STATE_FILE = resolve(DATA_DIR, 'virtual-state.json');

/** "light.bathroom_1*" → /^light\.bathroom_1.*$/ — `*` is any run, `?` one character. */
function globToRe(glob: string): RegExp {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${body}$`);
}

/**
 * Authoritative, pre-filtered mirror of HA state. Tablets get a snapshot on
 * connect and per-entity patches afterwards.
 * Emits: 'patch' (Entity), 'remove' (entity_id), 'reset' (after full refresh / config reload).
 */
export class StateCache extends EventEmitter {
  private entities = new Map<string, Entity>();
  private areaNames = new Map<string, string>();       // area_id -> name
  private deviceArea = new Map<string, string | null>(); // device_id -> area_id
  private registry = new Map<string, RegistryEntry>();
  /** entity_id -> room from a room's `entities` or `match`. Filled lazily, so an
   *  entity that first appears via state_changed still lands in its room. */
  private roomIndex = new Map<string, string>();
  private roomMisses = new Set<string>();
  private globs: { name: string; include: RegExp[]; exclude: RegExp[] }[] = [];
  /** configured room names; null when rooms come from the HA area registry */
  private roomNames: Set<string> | null = null;
  /** power entities rendered through a virtual fan — hidden as standalone cards */
  private absorbed = new Set<string>();
  /** virtual fan entity_id -> last speed index (1-based); 0 = unknown */
  private speeds = new Map<string, number>();
  private rawStates: Record<string, unknown>[] = [];
  haStatus: 'connected' | 'reconnecting' = 'reconnecting';

  private ha: HaClient;

  constructor(ha: HaClient) {
    super();
    this.ha = ha;
    this.loadSpeeds();
    this.indexRooms();
    ha.on('ready', () => void this.refreshWithRetry());
    ha.on('status', (s: 'connected' | 'reconnecting') => {
      this.haStatus = s;
      this.emit('status', s);
    });
    ha.on('event', (ev: { event_type: string; data: Record<string, unknown> }) => this.onEvent(ev));
    onConfigChange(() => {
      this.rebuild();
      this.emit('reset');
    });
  }

  private async refreshWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.refresh();
        return;
      } catch (err) {
        console.warn(`state refresh failed (attempt ${attempt}):`, (err as Error).message);
        await new Promise(r => setTimeout(r, 2000 * attempt));
        if (this.haStatus !== 'connected') return; // a reconnect will trigger a fresh 'ready'
      }
    }
  }

  private async refresh(): Promise<void> {
    const [states, areas, devices, registry] = await Promise.all([
      this.ha.send({ type: 'get_states' }),
      this.ha.send({ type: 'config/area_registry/list' }),
      this.ha.send({ type: 'config/device_registry/list' }),
      this.ha.send({ type: 'config/entity_registry/list' }),
    ]) as [Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[], RegistryEntry[]];

    this.areaNames = new Map(areas.map(a => [a.area_id as string, a.name as string]));
    this.deviceArea = new Map(devices.map(d => [d.id as string, (d.area_id as string) ?? null]));
    this.registry = new Map(registry.map(r => [r.entity_id, r]));

    this.rawStates = states;
    this.rebuild();
    this.emit('reset');
    console.log(`state cache ready: ${this.entities.size} dashboard entities (${states.length} total)`);
  }

  private rebuild(): void {
    this.indexRooms();
    this.entities.clear();
    for (const s of this.rawStates) {
      const e = this.toEntity(s);
      if (e) this.entities.set(e.entity_id, e);
    }
    for (const v of dashboardConfig().virtual) {
      if (this.entities.has(v.entity_id)) console.warn(`virtual ${v.entity_id} replaces a real HA entity with the same id`);
      const e = this.virtualEntity(v);
      if (e) this.entities.set(e.entity_id, e);
    }
  }

  private indexRooms(): void {
    const cfg = dashboardConfig();
    this.roomIndex.clear();
    this.roomMisses.clear();
    this.absorbed = new Set(cfg.virtual.map(v => v.power));
    this.roomNames = cfg.rooms.length ? new Set(cfg.rooms.map(r => r.name)) : null;
    // explicit ids win over every glob, whichever room lists them
    for (const room of cfg.rooms) {
      for (const id of room.entities ?? []) {
        if (!this.roomIndex.has(id)) this.roomIndex.set(id, room.name);
      }
    }
    this.globs = cfg.rooms
      .filter(r => r.match?.length)
      .map(r => ({
        name: r.name,
        include: r.match!.filter(g => !g.startsWith('!')).map(globToRe),
        exclude: r.match!.filter(g => g.startsWith('!')).map(g => globToRe(g.slice(1))),
      }));
  }

  /** Room from the config — explicit id, then globs in room order — memoised per id. */
  private configRoom(entity_id: string): string | undefined {
    const hit = this.roomIndex.get(entity_id);
    if (hit !== undefined || this.roomMisses.has(entity_id)) return hit;
    for (const g of this.globs) {
      if (g.include.some(re => re.test(entity_id)) && !g.exclude.some(re => re.test(entity_id))) {
        this.roomIndex.set(entity_id, g.name);
        return g.name;
      }
    }
    this.roomMisses.add(entity_id);
    return undefined;
  }

  /** Apply filter rules; returns null when the entity is not dashboard-worthy. */
  private toEntity(s: Record<string, unknown>): Entity | null {
    const entity_id = s.entity_id as string;
    const domain = entity_id.split('.')[0];
    if (NOISE_DOMAINS.has(domain)) return null;

    const cfg = dashboardConfig();
    if (cfg.hiddenEntities.includes(entity_id)) return null;
    // a virtual fan renders its power entity; don't also show it on its own
    if (this.absorbed.has(entity_id)) return null;

    const reg = this.registry.get(entity_id);
    if (reg) {
      if (reg.hidden_by || reg.disabled_by) return null;
      if (reg.entity_category === 'diagnostic' || reg.entity_category === 'config') return null;
      if (reg.platform === 'mobile_app') return null;
    }

    let attributes = s.attributes as Record<string, unknown>;
    const rename = cfg.names[entity_id];
    if (rename) attributes = { ...attributes, friendly_name: rename };

    return {
      entity_id,
      state: s.state as string,
      attributes,
      area: this.resolveRoom(entity_id),
      last_changed: s.last_changed as string,
    };
  }

  private resolveRoom(entity_id: string): string | null {
    const fromConfig = this.configRoom(entity_id);
    if (fromConfig) return fromConfig;
    return this.listed(dashboardConfig().areaOverrides[entity_id] ?? this.haArea(entity_id));
  }

  private haArea(entity_id: string): string | null {
    const reg = this.registry.get(entity_id);
    if (!reg) return null;
    const areaId = reg.area_id ?? (reg.device_id ? this.deviceArea.get(reg.device_id) : null);
    return areaId ? this.areaNames.get(areaId) ?? null : null;
  }

  /**
   * With an explicit room list, a room name outside it would be reachable from
   * no tab and missing from Other too — so it counts as unassigned.
   */
  private listed(room: string | null | undefined): string | null {
    if (!room) return null;
    return this.roomNames && !this.roomNames.has(room) ? null : room;
  }

  /* ---------- virtual fans (power entity + one button per speed) ---------- */

  private rawState(entity_id: string): Record<string, unknown> | undefined {
    return this.rawStates.find(s => s.entity_id === entity_id);
  }

  private virtualEntity(v: VirtualFan): Entity | null {
    if (dashboardConfig().hiddenEntities.includes(v.entity_id)) return null;
    const src = this.rawState(v.power);
    const n = v.speeds.length;
    const step = 100 / n;
    // clamp: the speed list may have shrunk since this index was saved
    const idx = Math.min(this.speeds.get(v.entity_id) ?? 0, n);
    const state = (src?.state as string | undefined) ?? 'unavailable';
    return {
      entity_id: v.entity_id,
      state,
      attributes: {
        friendly_name: v.name,
        supported_features: 1,           // SET_SPEED — drives FanCard's slider
        percentage_step: step,
        percentage: state === 'on' && idx > 0 ? Math.round(idx * step) : null,
      },
      area: this.listed(v.room),
      last_changed: src?.last_changed as string | undefined,
    };
  }

  /** Speed index is 1-based; 0 means "unknown" (nothing sent since boot). */
  setVirtualSpeed(entity_id: string, index: number): void {
    this.speeds.set(entity_id, index);
    this.saveSpeeds();
    this.repatchVirtual(entity_id);
  }

  private repatchVirtual(entity_id: string): void {
    const v = dashboardConfig().virtual.find(x => x.entity_id === entity_id);
    if (!v) return;
    const e = this.virtualEntity(v);
    if (e) {
      this.entities.set(e.entity_id, e);
      this.emit('patch', e);
    } else if (this.entities.delete(entity_id)) {
      this.emit('remove', entity_id);
    }
  }

  /** Re-derive every virtual fan whose power entity is `power_id`. */
  private repatchVirtualsFor(power_id: string): void {
    for (const v of dashboardConfig().virtual) {
      if (v.power === power_id) this.repatchVirtual(v.entity_id);
    }
  }

  private loadSpeeds(): void {
    try {
      const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Record<string, unknown>;
      this.speeds = new Map(Object.entries(raw)
        .filter((kv): kv is [string, number] => Number.isInteger(kv[1]) && (kv[1] as number) >= 0));
    } catch { /* first run, or no writable data dir — speeds simply start unknown */ }
  }

  private saveSpeeds(): void {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(this.speeds)));
    } catch (err) {
      console.warn('could not persist virtual fan speeds:', (err as Error).message);
    }
  }

  virtualFor(entity_id: string): VirtualFan | undefined {
    return dashboardConfig().virtual.find(v => v.entity_id === entity_id);
  }

  stateOf(entity_id: string): string | undefined {
    return this.rawState(entity_id)?.state as string | undefined;
  }

  /* ---------- live updates ---------- */

  private onEvent(ev: { event_type: string; data: Record<string, unknown> }): void {
    if (ev.event_type !== 'state_changed') return;
    const ns = ev.data.new_state as Record<string, unknown> | null;
    const entity_id = ev.data.entity_id as string;
    const idx = this.rawStates.findIndex(s => s.entity_id === entity_id);

    if (!ns) {
      // Removed or renamed in HA. Drop the raw state even when the entity was
      // hidden or absorbed — otherwise it lingers and resurfaces after a rebuild.
      if (idx >= 0) this.rawStates.splice(idx, 1);
      this.repatchVirtualsFor(entity_id); // a vanished power entity makes its fan unavailable
      if (this.entities.delete(entity_id)) this.emit('remove', entity_id);
      return;
    }
    if (idx >= 0) this.rawStates[idx] = ns; else this.rawStates.push(ns);
    this.repatchVirtualsFor(entity_id);

    const e = this.toEntity(ns);
    if (!e) return;
    this.entities.set(entity_id, e);
    this.emit('patch', e);
  }

  /**
   * `rooms` stays a plain string[] so a panel still running an older bundle can
   * read a snapshot across a deploy; icons travel separately. Every configured
   * room is sent — the client hides empty ones, so a room that gains its first
   * device mid-session appears without a reset.
   */
  snapshot(): { haStatus: string; rooms: string[]; roomIcons: Record<string, string>; entities: Entity[] } {
    const cfg = dashboardConfig();
    const entities = [...this.entities.values()];
    if (cfg.rooms.length) {
      const roomIcons: Record<string, string> = {};
      for (const r of cfg.rooms) if (r.icon) roomIcons[r.name] = r.icon;
      return { haStatus: this.haStatus, rooms: cfg.rooms.map(r => r.name), roomIcons, entities };
    }
    // legacy: one room per HA area, plus any areaOverrides target or virtual fan room
    // (else those would be reachable from no tab), roomOrder first
    const known = new Set([
      ...this.areaNames.values(),
      ...Object.values(cfg.areaOverrides),
      ...cfg.virtual.map(v => v.room).filter(Boolean),
    ]);
    const rooms = [
      ...cfg.roomOrder.filter(r => known.has(r)),
      ...[...known].filter(r => !cfg.roomOrder.includes(r)).sort(),
    ];
    return { haStatus: this.haStatus, rooms, roomIcons: {}, entities };
  }
}
