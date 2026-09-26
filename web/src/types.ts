export interface Entity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  area: string | null;
  last_changed?: string;
  /** set client-side while an optimistic update is awaiting confirmation */
  pending?: boolean;
}

export type HaStatus = 'connected' | 'reconnecting';
export type LinkStatus = 'live' | 'reconnecting';

export interface Snapshot {
  type: 'snapshot';
  haStatus: HaStatus;
  /** configured room names in sidebar order, empty ones included */
  rooms: string[];
  /** room name → icon key */
  roomIcons?: Record<string, string>;
  /** path of the bundle the server serves; differs from ours after a deploy */
  build?: string;
  entities: Entity[];
}

export type ServerMessage =
  | Snapshot
  | { type: 'state_changed'; entity: Entity }
  | { type: 'removed'; entity_id: string }
  | { type: 'ha_status'; status: HaStatus }
  | { type: 'result'; id: number; success: boolean; error?: string }
  | { type: 'screen'; state: 'awake' | 'asleep' }
  | { type: 'pong'; id?: number };

export const domainOf = (id: string): string => id.split('.')[0];
export const UNASSIGNED = 'Other';
