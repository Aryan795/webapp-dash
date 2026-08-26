import { useDash, entitiesForRoom } from '../store/entities';
import { cardFor } from '../cards/registry';

export default function RoomGrid({ room }: { room: string }) {
  const entities = useDash(s => s.entities);
  const hideUnavailable = useDash(s => s.hideUnavailable);
  const list = entitiesForRoom(entities, room, hideUnavailable);

  if (list.length === 0) {
    return <div className="grid flex-1 place-items-center text-[var(--mut)]">Nothing in this room yet</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-3.5 pb-4 md:grid-cols-3 lg:grid-cols-4">
      {list.map(e => cardFor(e))}
    </div>
  );
}
