import type { Entity } from '../types';
import { domainOf } from '../types';
import { useDash } from '../store/entities';
import { CardShell } from './base';

export default function SwitchCard({ e }: { e: Entity }) {
  const callService = useDash(s => s.callService);
  const domain = domainOf(e.entity_id);
  const on = e.state === 'on';
  return (
    <CardShell e={e} color="var(--c-light)" icon="switch" active={on}
      sub={on ? 'On' : 'Off'}
      onTap={() => callService(domain, 'toggle', e.entity_id, undefined, { state: on ? 'off' : 'on' })} />
  );
}
