import { useDash, activeNow, isActive, isUnavailable } from '../store/entities';
import { domainOf } from '../types';
import type { Entity } from '../types';
import { cardFor } from '../cards/registry';
import { friendly } from '../cards/base';
import StatusChips from './StatusChips';

const label = 'text-[11px] font-semibold uppercase tracking-[.16em]';

function RoutinePill({ e }: { e: Entity }) {
  const callService = useDash(s => s.callService);
  const domain = domainOf(e.entity_id);
  const on = e.state === 'on';
  const run = () => {
    if (domain === 'script') callService('script', 'turn_on', e.entity_id);
    else callService(domain, 'toggle', e.entity_id, undefined, { state: on ? 'off' : 'on' });
  };
  return (
    <button onClick={run}
      className="card flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold"
      style={on ? { borderColor: 'var(--c-printer)', color: 'var(--c-printer)' } : undefined}>
      <i className="inline-block h-2 w-2 rounded-full"
        style={{ background: on ? 'var(--c-printer)' : 'var(--mut)' }} />
      {friendly(e)}
    </button>
  );
}

export default function HomeGlance() {
  const entities = useDash(s => s.entities);
  const callService = useDash(s => s.callService);
  const all = Object.values(entities);

  const active = activeNow(entities);
  const climate = all.find(e => domainOf(e.entity_id) === 'climate');
  const media = all.find(e => domainOf(e.entity_id) === 'media_player' && !isUnavailable(e)
      && /everywhere|echo show/i.test(friendly(e)))
    ?? all.find(e => domainOf(e.entity_id) === 'media_player' && !isUnavailable(e));
  const routines = all
    .filter(e => ['script', 'input_boolean'].includes(domainOf(e.entity_id)))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
    .slice(0, 10);
  const lightsOn = all.filter(e => domainOf(e.entity_id) === 'light' && e.state === 'on');

  const temps = all.filter(e => e.attributes.device_class === 'temperature' && Number.isFinite(Number(e.state)));
  const hums = all.filter(e => e.attributes.device_class === 'humidity' && Number.isFinite(Number(e.state)));
  const avg = (xs: Entity[]) => xs.length
    ? xs.reduce((a, b) => a + Number(b.state), 0) / xs.length : null;
  const avgTemp = avg(temps), avgHum = avg(hums);

  return (
    <>
      <StatusChips />

      <p className={label} style={{ color: 'var(--mut)' }}>Comfort</p>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {climate && cardFor(climate, { wide: true })}
        <div className="card flex flex-col gap-2 p-4">
          <div className="card-name text-sm font-semibold">Home climate</div>
          <div className="mt-auto flex gap-4">
            <div>
              <div className="text-xl font-semibold tabular-nums">{avgTemp != null ? `${avgTemp.toFixed(1)}°` : '–'}</div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--mut)' }}>
                Avg temp · {temps.length} sensors
              </div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{avgHum != null ? `${Math.round(avgHum)}%` : '–'}</div>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--mut)' }}>Humidity</div>
            </div>
          </div>
        </div>
        {media && cardFor(media)}
      </div>

      {routines.length > 0 && (
        <>
          <p className={label} style={{ color: 'var(--mut)' }}>Routines &amp; modes</p>
          <div className="flex flex-wrap gap-2">
            {routines.map(e => <RoutinePill key={e.entity_id} e={e} />)}
          </div>
        </>
      )}

      <p className={label} style={{ color: 'var(--mut)' }}>Active now</p>
      {active.length === 0
        ? <div className="card p-6 text-center text-sm" style={{ color: 'var(--mut)' }}>All quiet — nothing is on.</div>
        : <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4">
            {active.slice(0, 12).map(e => cardFor(e))}
          </div>}

      <div className="card mt-auto flex items-center gap-3 rounded-full px-5 py-3 text-sm">
        <b>{lightsOn.length} light{lightsOn.length === 1 ? '' : 's'} on</b>
        {climate && isActive(climate) && (
          <span style={{ color: 'var(--mut)' }}>
            · AC {climate.state} to {String(climate.attributes.temperature ?? '–')}°
          </span>
        )}
        <button className="ml-auto font-bold" style={{ color: 'var(--acc)' }}
          onClick={() => {
            for (const e of lightsOn) callService('light', 'turn_off', e.entity_id, undefined, { state: 'off' });
          }}>
          All lights off
        </button>
      </div>
    </>
  );
}
