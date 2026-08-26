import type { Entity } from '../types';
import { domainOf } from '../types';
import { useDash } from '../store/entities';
import { CardShell } from './base';

/** script / number / select / counter / anything unrecognized */
export default function GenericCard({ e }: { e: Entity }) {
  const callService = useDash(s => s.callService);
  const domain = domainOf(e.entity_id);

  if (domain === 'script') {
    return (
      <CardShell e={e} color="var(--c-printer)" icon="script" active={false} sub="Tap to run"
        onTap={() => callService('script', 'turn_on', e.entity_id)} />
    );
  }

  if (domain === 'number') {
    const min = (e.attributes.min as number) ?? 0;
    const max = (e.attributes.max as number) ?? 100;
    const step = (e.attributes.step as number) ?? 1;
    const unit = (e.attributes.unit_of_measurement as string) ?? '';
    return (
      <CardShell e={e} color="var(--c-sensor)" icon="generic" active={false}
        sub={`${e.state}${unit ? ' ' + unit : ''}`}>
        <input type="range" min={min} max={max} step={step}
          defaultValue={Number(e.state) || min}
          onChange={ev => callService('number', 'set_value', e.entity_id,
            { value: Number(ev.target.value) }, { state: ev.target.value })}
          className="mt-auto" />
      </CardShell>
    );
  }

  if (domain === 'select') {
    const options = (e.attributes.options ?? []) as string[];
    return (
      <CardShell e={e} color="var(--c-sensor)" icon="generic" active={false} sub="Select">
        <select value={e.state}
          onChange={ev => callService('select', 'select_option', e.entity_id,
            { option: ev.target.value }, { state: ev.target.value })}
          className="mt-auto w-full rounded-lg border bg-transparent px-2 py-2 text-sm"
          style={{ borderColor: 'var(--brd)', color: 'var(--tx)' }}>
          {options.map(o => <option key={o} value={o} style={{ color: '#111' }}>{o}</option>)}
        </select>
      </CardShell>
    );
  }

  if (domain === 'counter') {
    return (
      <CardShell e={e} color="var(--c-sensor)" icon="generic" active={false} sub={`Count: ${e.state}`}>
        <div className="mt-auto flex gap-1.5">
          <button className="flex-1 rounded-lg border py-2 font-bold" style={{ borderColor: 'var(--brd)' }}
            onClick={() => callService('counter', 'decrement', e.entity_id, undefined,
              { state: String(Number(e.state) - 1) })}>−</button>
          <button className="flex-1 rounded-lg border py-2 font-bold" style={{ borderColor: 'var(--brd)' }}
            onClick={() => callService('counter', 'increment', e.entity_id, undefined,
              { state: String(Number(e.state) + 1) })}>+</button>
        </div>
      </CardShell>
    );
  }

  return <CardShell e={e} color="var(--c-sensor)" icon="generic" active={e.state === 'on'} sub={e.state} />;
}
