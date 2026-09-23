import { useEffect, useRef, useState } from 'react';
import type { Entity } from '../types';
import { useDash } from '../store/entities';
import { CardShell, friendly } from './base';

const SUPPORTS_SPEED = 1;

/**
 * The slider moves in speed steps (1..n), not raw percent. HA's step for a
 * 6-speed fan is 16.666…, and a percent slider with that step can never land
 * on 100, so the top speed was unreachable. It commits once, on release: each
 * step of an IR fan is a real button press, and a drag must not send every
 * speed on the way. Turning off is a tap on the card, never the slider's end.
 */
export default function FanCard({ e }: { e: Entity }) {
  const callService = useDash(s => s.callService);
  const on = e.state === 'on';
  const feat = (e.attributes.supported_features as number) ?? 0;
  const hasSpeed = (feat & SUPPORTS_SPEED) !== 0;
  const pct = (e.attributes.percentage as number | null) ?? null;
  const n = Math.max(1, Math.round(100 / (Number(e.attributes.percentage_step) || 1)));
  const level = (p: number) => Math.min(n, Math.max(1, Math.round(p / (100 / n))));

  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? (pct != null && pct > 0 ? level(pct) : 1);

  const slider = useRef<HTMLInputElement>(null);
  const commit = useRef<(v: number) => void>(() => {});
  commit.current = (v: number) => {
    setDrag(null);
    const percentage = Math.min(100, Math.round((v * 100) / n));
    callService('fan', 'set_percentage', e.entity_id, { percentage },
      { attributes: { ...e.attributes, percentage } });
  };
  // the native `change` event fires once: on release, or per committed key press
  useEffect(() => {
    const el = slider.current;
    if (!el) return;
    const onCommit = () => commit.current(Number(el.value));
    el.addEventListener('change', onCommit);
    return () => el.removeEventListener('change', onCommit);
  }, [hasSpeed, on]);

  const sub = !on ? 'Off'
    : !hasSpeed || pct == null ? 'On'
    : n <= 10 ? `On · speed ${level(pct)} of ${n}` : `On · ${pct}%`;

  return (
    <CardShell e={e} color="var(--c-fan)" icon="fan" active={on} sub={sub}
      onTap={() => callService('fan', 'toggle', e.entity_id, undefined, { state: on ? 'off' : 'on' })}>
      {hasSpeed && on && (
        <input ref={slider} type="range" min={1} max={n} step={1} value={shown}
          aria-label={`${friendly(e)} speed`}
          onClick={ev => ev.stopPropagation()}
          onChange={ev => setDrag(Number(ev.target.value))}
          className="mt-auto" />
      )}
    </CardShell>
  );
}
