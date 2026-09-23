import { useDash, entitiesForRoom } from '../store/entities';
import { domainOf } from '../types';
import type { Entity } from '../types';
import { cardFor } from '../cards/registry';

/**
 * Rooms read better grouped than as one undifferentiated wall of cards —
 * the same shape as the Lovelace/Mushroom layout this replaces. Sections
 * appear only when they have something in them.
 */
const SECTIONS: { label: string; domains: string[]; dense?: boolean }[] = [
  { label: 'Climate', domains: ['climate', 'fan'] },
  { label: 'Lights', domains: ['light'] },
  { label: 'Switches', domains: ['switch', 'input_boolean'] },
  { label: 'Blinds', domains: ['cover'] },
  { label: 'Media', domains: ['media_player', 'camera'] },
  { label: 'Controls', domains: ['number', 'select', 'counter', 'script'] },
  { label: 'Sensors', domains: ['sensor', 'binary_sensor'], dense: true },
];

export default function RoomGrid({ room }: { room: string }) {
  const entities = useDash(s => s.entities);
  const hideUnavailable = useDash(s => s.hideUnavailable);
  const callService = useDash(s => s.callService);
  const list = entitiesForRoom(entities, room, hideUnavailable);

  if (list.length === 0) {
    return <div className="grid flex-1 place-items-center text-[var(--mut)]">Nothing in this room yet</div>;
  }

  const used = new Set<Entity>();
  const groups = SECTIONS.map(sec => {
    const items = list.filter(e => sec.domains.includes(domainOf(e.entity_id)));
    items.forEach(e => used.add(e));
    return { ...sec, items };
  }).filter(g => g.items.length > 0);
  // weather is drawn in the header, not as a card
  const rest = list.filter(e => !used.has(e) && domainOf(e.entity_id) !== 'weather');
  if (rest.length) groups.push({ label: 'Other', domains: [], items: rest });

  const lightsOn = list.filter(e => domainOf(e.entity_id) === 'light' && e.state === 'on');

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      {lightsOn.length > 0 && (
        <div className="card flex items-center gap-3 rounded-full px-5 py-2.5 text-sm">
          <b>{lightsOn.length} light{lightsOn.length === 1 ? '' : 's'} on</b>
          <button className="ml-auto font-bold" style={{ color: 'var(--acc)' }}
            onClick={() => {
              for (const e of lightsOn) callService('light', 'turn_off', e.entity_id, undefined, { state: 'off' });
            }}>
            Turn all off
          </button>
        </div>
      )}
      {groups.map(g => (
        <section key={g.label} className="flex flex-col gap-3.5">
          <p className="section-label">{g.label}</p>
          <div className={g.dense ? 'card-grid dense' : 'card-grid'}>
            {g.items.map(e => cardFor(e))}
          </div>
        </section>
      ))}
    </div>
  );
}
