import { useState } from 'react';
import { useDash } from '../store/entities';
import { UNASSIGNED } from '../types';
import Settings from './Settings';

const ROOM_ICONS: Record<string, string> = {
  Hall: 'M4 5h16v14H4zM4 12h16',
  Hallway: 'M5 19V7l7-3 7 3v12M9 19v-6h6v6',
  Kitchen: 'M4 4h16v16H4zM8 4v16M4 10h16',
  'Laundry room': 'M6 4h12v16H6zM12 13m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  'Home Entrance': 'M4 11 12 4l8 7M6 10v9h12v-9M12 14v5',
};
const DEFAULT_ICON = 'M4 7h16v12H4zM12 7v12';

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto mb-1 h-[22px] w-[22px]"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {d.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}
    </svg>
  );
}

export default function Sidebar() {
  const rooms = useDash(s => s.rooms);
  const room = useDash(s => s.room);
  const setRoom = useDash(s => s.setRoom);
  const entities = useDash(s => s.entities);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hasUnassigned = Object.values(entities).some(e => !e.area);
  const items: { key: string; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: 'M3 11 12 4l9 7M5 10v9h14v-9' },
    ...rooms.map(r => ({ key: r, label: r, icon: ROOM_ICONS[r] ?? DEFAULT_ICON })),
    ...(hasUnassigned ? [{ key: UNASSIGNED, label: 'Other', icon: 'M4 6h16M4 12h16M4 18h10' }] : []),
  ];

  return (
    <nav className="flex w-24 flex-none flex-col items-center gap-1.5 overflow-y-auto py-4"
      style={{ background: 'var(--side)', backdropFilter: 'var(--blur)' }}>
      {items.map(it => (
        <button key={it.key} onClick={() => setRoom(it.key)}
          className="w-[76px] rounded-2xl px-1 py-2.5 text-center text-[11px] font-semibold leading-tight"
          style={it.key === room
            ? { background: 'var(--side-act)', color: 'var(--acc)' }
            : { color: 'var(--mut)' }}>
          <Icon d={it.icon} />
          {it.label}
        </button>
      ))}
      <button onClick={() => setSettingsOpen(true)} aria-label="Settings"
        className="mt-auto w-[76px] rounded-2xl px-1 py-2.5" style={{ color: 'var(--mut)' }}>
        <Icon d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </button>
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </nav>
  );
}
