import type { Entity } from '../types';
import { isUnavailable } from '../store/entities';
import { CardShell } from './base';

export default function SensorCard({ e }: { e: Entity }) {
  const dc = e.attributes.device_class as string | undefined;
  const isEnergy = dc === 'energy' || dc === 'power';
  const unit = (e.attributes.unit_of_measurement as string) ?? '';
  let value = e.state;
  if (dc === 'timestamp') value = '–';
  else if (Number.isFinite(Number(value))) {
    const n = Number(value);
    value = Number.isInteger(n) ? String(n) : n.toFixed(1);
  } else if (value.length > 14) value = value.slice(0, 13) + '…';

  return (
    <CardShell e={e} color={isEnergy ? 'var(--c-energy)' : 'var(--c-sensor)'}
      icon={isEnergy ? 'energy' : 'sensor'}
      active={!isUnavailable(e) && Number.isFinite(Number(e.state))}
      sub={(dc ?? 'sensor').replace(/_/g, ' ')}>
      {!isUnavailable(e) && (
        <div className="mt-auto text-xl font-semibold tabular-nums tracking-tight">
          {value}<span className="ml-1 text-xs font-medium" style={{ color: 'var(--mut)' }}>{unit}</span>
        </div>
      )}
    </CardShell>
  );
}
