import type { Entity } from '../types';
import { CardShell } from './base';

const LABELS: Record<string, [string, string]> = {
  motion: ['Motion', 'Clear'], occupancy: ['Occupied', 'Clear'],
  door: ['Open', 'Closed'], window: ['Open', 'Closed'], opening: ['Open', 'Closed'],
  connectivity: ['Connected', 'Disconnected'], problem: ['Problem', 'OK'],
  running: ['Running', 'Idle'], power: ['Powered', 'Off'], moisture: ['Wet', 'Dry'],
};

export default function BinarySensorCard({ e }: { e: Entity }) {
  const on = e.state === 'on';
  const dc = e.attributes.device_class as string | undefined;
  const [onLbl, offLbl] = LABELS[dc ?? ''] ?? ['On', 'Off'];
  const icon = dc === 'motion' || dc === 'occupancy' ? 'motion' : 'sensor';
  return (
    <CardShell e={e} color="var(--c-sensor)" icon={icon} active={on} sub={on ? onLbl : offLbl} />
  );
}
