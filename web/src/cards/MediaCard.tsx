import type { Entity } from '../types';
import { useDash } from '../store/entities';
import { CardShell } from './base';

export default function MediaCard({ e }: { e: Entity }) {
  const callService = useDash(s => s.callService);
  const playing = e.state === 'playing';
  const title = e.attributes.media_title as string | undefined;
  const sub = playing ? (title ?? 'Playing') : e.state.charAt(0).toUpperCase() + e.state.slice(1);
  const act = (service: string, optimistic?: string) =>
    callService('media_player', service, e.entity_id, undefined, optimistic ? { state: optimistic } : undefined);

  return (
    <CardShell e={e} color="var(--c-media)" icon="media_player" active={playing} sub={sub}>
      <div className="mt-auto flex gap-1.5">
        <button className="flex-1 rounded-lg border py-2 text-sm" style={{ borderColor: 'var(--brd)' }}
          onClick={() => act('media_previous_track')} aria-label="Previous">⏮</button>
        <button className="flex-1 rounded-lg border py-2 text-sm" style={{ borderColor: 'var(--brd)' }}
          onClick={() => act('media_play_pause', playing ? 'paused' : 'playing')} aria-label="Play/pause">
          {playing ? '⏸' : '▶'}
        </button>
        <button className="flex-1 rounded-lg border py-2 text-sm" style={{ borderColor: 'var(--brd)' }}
          onClick={() => act('media_next_track')} aria-label="Next">⏭</button>
      </div>
    </CardShell>
  );
}
