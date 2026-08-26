import type { Entity } from '../types';
import { useDash } from '../store/entities';
import { CardShell } from './base';

const SUPPORTS_SPEED = 1;

export default function FanCard({ e }: { e: Entity }) {
  const callService = useDash(s => s.callService);
  const on = e.state === 'on';
  const feat = (e.attributes.supported_features as number) ?? 0;
  const hasSpeed = (feat & SUPPORTS_SPEED) !== 0;
  const pct = (e.attributes.percentage as number | null) ?? null;

  return (
    <CardShell e={e} color="var(--c-fan)" icon="fan" active={on}
      sub={on ? (hasSpeed && pct != null ? `On · ${pct}%` : 'On') : 'Off'}
      onTap={() => callService('fan', 'toggle', e.entity_id, undefined, { state: on ? 'off' : 'on' })}>
      {hasSpeed && on && (
        <input type="range" min={0} max={100}
          step={(e.attributes.percentage_step as number) ?? 1}
          defaultValue={pct ?? 0}
          onClick={ev => ev.stopPropagation()}
          onChange={ev => callService('fan', 'set_percentage', e.entity_id,
            { percentage: Number(ev.target.value) },
            { attributes: { ...e.attributes, percentage: Number(ev.target.value) } })}
          className="mt-auto" />
      )}
    </CardShell>
  );
}
