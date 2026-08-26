import { useDash } from '../store/entities';
import { domainOf } from '../types';

/** Noteworthy-now chips (idea from the top-voted iOS dashboard): only render
 *  chips for things actually happening. */
export default function StatusChips() {
  const entities = useDash(s => s.entities);
  const all = Object.values(entities);
  const chips: { key: string; color: string; text: string }[] = [];

  for (const e of all) {
    const d = domainOf(e.entity_id);
    const name = String(e.attributes.friendly_name ?? e.entity_id);
    if (d === 'media_player' && e.state === 'playing') {
      const t = e.attributes.media_title ? ` · ${e.attributes.media_title}` : '';
      chips.push({ key: e.entity_id, color: 'var(--c-media)', text: `${name}${t}` });
    }
    if (d === 'binary_sensor' && e.state === 'on'
      && ['motion', 'occupancy'].includes(String(e.attributes.device_class))) {
      chips.push({ key: e.entity_id, color: 'var(--c-sensor)', text: `Motion · ${e.area ?? name}` });
    }
    if (d === 'cover' && e.state === 'open') {
      chips.push({ key: e.entity_id, color: 'var(--c-cover)', text: `${name} open` });
    }
  }
  // 3D printer progress, if moonraker/octoprint expose it as a % sensor
  const printer = all.find(e =>
    /print.*(progress|percent)|progress.*print/i.test(e.entity_id) && Number.isFinite(Number(e.state)));
  if (printer && Number(printer.state) > 0 && Number(printer.state) < 100) {
    chips.push({ key: printer.entity_id, color: 'var(--c-printer)', text: `Printing · ${Math.round(Number(printer.state))}%` });
  }

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.slice(0, 6).map(c => (
        <span key={c.key} className="card flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold">
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
          {c.text}
        </span>
      ))}
    </div>
  );
}
