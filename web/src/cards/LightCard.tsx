import type { Entity } from '../types';
import { useDash } from '../store/entities';
import { CardShell } from './base';

export default function LightCard({ e }: { e: Entity }) {
  const callService = useDash(s => s.callService);
  const on = e.state === 'on';
  const modes = (e.attributes.supported_color_modes ?? []) as string[];
  const dimmable = modes.some(m => ['brightness', 'rgb', 'rgbw', 'rgbww', 'hs', 'xy', 'color_temp'].includes(m));
  const colorful = modes.some(m => ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].includes(m));
  const bri = Math.round(((e.attributes.brightness as number | undefined) ?? 0) / 2.55);

  const toggle = () => callService('light', 'toggle', e.entity_id, undefined, { state: on ? 'off' : 'on' });

  return (
    <CardShell e={e} color={colorful ? 'var(--c-led)' : 'var(--c-light)'} icon={colorful ? 'led' : 'light'}
      active={on} sub={on ? (dimmable ? `On · ${bri}%` : 'On') : 'Off'} onTap={toggle}>
      {dimmable && on && (
        <input type="range" min={1} max={100} defaultValue={bri}
          onClick={ev => ev.stopPropagation()}
          onChange={ev => callService('light', 'turn_on', e.entity_id,
            { brightness_pct: Number(ev.target.value) },
            { attributes: { ...e.attributes, brightness: Number(ev.target.value) * 2.55 } })}
          className="mt-auto" />
      )}
      {colorful && on && (
        <div className="mt-auto h-2 rounded"
          style={{ background: 'linear-gradient(90deg,#FF5252,#FFB454,#7DDB6E,#4FC3F7,#B388FF)' }} />
      )}
    </CardShell>
  );
}
