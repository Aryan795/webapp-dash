import { EventEmitter } from 'node:events';
import type { HaClient } from './ha-client.ts';
import { dashboardConfig, onConfigChange } from './config.ts';

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

/**
 * Authoritative, pre-filtered mirror of HA state. Tablets get a snapshot on
 * connect and per-entity patches afterwards.
 * Emits: 'patch' (Entity), 'reset' (after full refresh / config reload).
 */
export class StateCache extends EventEmitter {
  private entities = new Map<string, Entity>();
  private areaNames = new Map<string, string>();       // area_id -> name
  private deviceArea = new Map<string, string | null>(); // device_id -> area_id
  private registry = new Map<string, RegistryEntry>();
  haStatus: 'connected' | 'reconnecting' = 'reconnecting';

  private ha: HaClient;

  constructor(ha: HaClient) {
    super();
    this.ha = ha;
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

  private rawStates: Record<string, unknown>[] = [];

  private rebuild(): void {
    this.entities.clear();
    for (const s of this.rawStates) {
      const e = this.toEntity(s);
      if (e) this.entities.set(e.entity_id, e);
    }
  }

  /** Apply filter rules; returns null when the entity is not dashboard-worthy. */
  private toEntity(s: Record<string, unknown>): Entity | null {
    const entity_id = s.entity_id as string;
    const domain = entity_id.split('.')[0];
    if (NOISE_DOMAINS.has(domain)) return null;

    const cfg = dashboardConfig();
    if (cfg.hiddenEntities.includes(entity_id)) return null;

    const reg = this.registry.get(entity_id);
    if (reg) {
      if (reg.hidden_by || reg.disabled_by) return null;
      if (reg.entity_category === 'diagnostic' || reg.entity_category === 'config') return null;
      if (reg.platform === 'mobile_app') return null;
    }

    return {
      entity_id,
      state: s.state as string,
      attributes: s.attributes as Record<string, unknown>,
      area: this.resolveArea(entity_id),
      last_changed: s.last_changed as string,
    };
  }

  private resolveArea(entity_id: string): string | null {
    const cfg = dashboardConfig();
    if (cfg.areaOverrides[entity_id]) return cfg.areaOverrides[entity_id];
    const reg = this.registry.get(entity_id);
    if (!reg) return null;
    const areaId = reg.area_id ?? (reg.device_id ? this.deviceArea.get(reg.device_id) : null);
    return areaId ? this.areaNames.get(areaId) ?? null : null;
  }

  private onEvent(ev: { event_type: string; data: Record<string, unknown> }): void {
    if (ev.event_type !== 'state_changed') return;
    const ns = ev.data.new_state as Record<string, unknown> | null;
    const entity_id = ev.data.entity_id as string;
    if (!ns) {
      // entity removed
      if (this.entities.delete(entity_id)) {
        const idx = this.rawStates.findIndex(s => s.entity_id === entity_id);
        if (idx >= 0) this.rawStates.splice(idx, 1);
        this.emit('remove', entity_id);
      }
      return;
    }
    const idx = this.rawStates.findIndex(s => s.entity_id === entity_id);
    if (idx >= 0) this.rawStates[idx] = ns; else this.rawStates.push(ns);
    const e = this.toEntity(ns);
    if (!e) return;
    this.entities.set(entity_id, e);
    this.emit('patch', e);
  }

  snapshot(): { haStatus: string; rooms: string[]; entities: Entity[] } {
    const cfg = dashboardConfig();
    const known = new Set(this.areaNames.values());
    const ordered = [
      ...cfg.roomOrder.filter(r => known.has(r)),
      ...[...known].filter(r => !cfg.roomOrder.includes(r)).sort(),
    ];
    return {
      haStatus: this.haStatus,
      rooms: ordered,
      entities: [...this.entities.values()],
    };
  }
}
