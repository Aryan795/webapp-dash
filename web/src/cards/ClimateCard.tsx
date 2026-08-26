import type { Entity } from '../types';
import { useDash } from '../store/entities';
import { CardShell } from './base';

const MODE_LABELS: Record<string, string> = {
  auto: 'Auto', cool: 'Cool', heat: 'Heat', dry: 'Dry', fan_only: 'Fan', off: 'Off',
};

export default function ClimateCard({ e, wide }: { e: Entity; wide?: boolean }) {
  const callService = useDash(s => s.callService);
  const modes = (e.attributes.hvac_modes ?? []) as string[];
  const target = e.attributes.temperature as number | undefined;
  const current = e.attributes.current_temperature as number | undefined;
  const active = e.state !== 'off';
  const step = (e.attributes.target_temp_step as number) ?? 0.5;

  const nudge = (d: number) => {
    if (target == null) return;
    const t = Math.round((target + d * step) * 10) / 10;
    callService('climate', 'set_temperature', e.entity_id, { temperature: t },
      { attributes: { ...e.attributes, temperature: t } });
  };

  return (
    <CardShell e={e} color="var(--c-climate)" icon="climate" active={active} wide={wide}
      sub={active ? (MODE_LABELS[e.state] ?? e.state) + (current != null ? ` · now ${current}°` : '') : 'Off'}>
      <div className="flex items-center gap-3">
        <button className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold"
          style={{ background: 'color-mix(in srgb, var(--mut) 15%, transparent)' }}
          onClick={() => nudge(-1)} aria-label="Lower temperature">−</button>
        <div className="min-w-[86px] flex-1 text-center text-3xl font-semibold tabular-nums tracking-tight">
          {target != null ? `${target.toFixed(1)}°` : '–'}
        </div>
        <button className="grid h-11 w-11 place-items-center rounded-full text-xl font-bold"
          style={{ background: 'color-mix(in srgb, var(--mut) 15%, transparent)' }}
          onClick={() => nudge(1)} aria-label="Raise temperature">+</button>
      </div>
      <div className="mt-auto flex gap-1.5">
        {modes.map(m => (
          <button key={m}
            className="flex-1 rounded-lg border py-2 text-[11px] font-bold"
            style={m === e.state
              ? { background: 'color-mix(in srgb, var(--dc) 20%, transparent)', color: 'var(--dc)', borderColor: 'transparent' }
              : { color: 'var(--mut)', borderColor: 'var(--brd)' }}
            onClick={() => callService('climate', 'set_hvac_mode', e.entity_id, { hvac_mode: m }, { state: m })}>
            {MODE_LABELS[m] ?? m}
          </button>
        ))}
      </div>
    </CardShell>
  );
}
