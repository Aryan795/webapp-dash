import type { Entity } from '../types';
import { useDash } from '../store/entities';
import { CardShell } from './base';

export default function CoverCard({ e }: { e: Entity }) {
  const callService = useDash(s => s.callService);
  const pos = e.attributes.current_position as number | undefined;
  const open = e.state === 'open';
  const sub = e.state === 'open' && pos != null && pos < 100 ? `Open · ${pos}%`
    : e.state.charAt(0).toUpperCase() + e.state.slice(1);

  const act = (service: string, state?: string) =>
    callService('cover', service, e.entity_id, undefined, state ? { state } : undefined);

  return (
    <CardShell e={e} color="var(--c-cover)" icon="cover" active={open} sub={sub}>
      <div className="mt-auto flex gap-1.5">
        <button className="flex-1 rounded-lg border py-2 text-sm font-bold"
          style={{ borderColor: 'var(--brd)' }} onClick={() => act('open_cover', 'opening')}>▲</button>
        <button className="flex-1 rounded-lg border py-2 text-sm font-bold"
          style={{ borderColor: 'var(--brd)' }} onClick={() => act('stop_cover')}>■</button>
        <button className="flex-1 rounded-lg border py-2 text-sm font-bold"
          style={{ borderColor: 'var(--brd)' }} onClick={() => act('close_cover', 'closing')}>▼</button>
      </div>
    </CardShell>
  );
}
