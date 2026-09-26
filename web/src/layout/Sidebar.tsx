import { useState } from 'react';
import { useDash, visibleRooms, hasUnassigned } from '../store/entities';
import { UNASSIGNED } from '../types';
import Settings from './Settings';

const ROOM_ICONS: Record<string, string> = {
  sofa: 'M3 11V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3M2 12a2 2 0 0 1 4 0v4h12v-4a2 2 0 0 1 4 0v6H2zM6 18v2M18 18v2',
  hallway: 'M5 19V7l7-3 7 3v12M9 19v-6h6v6',
  bed: 'M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M7 9V7h5v2M3 18v2M21 18v2',
  kitchen: 'M4 4h16v16H4zM8 4v16M4 10h16',
  bath: 'M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM7 12V6.5a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2',
  puja: 'M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9M7 21h10',
  laundry: 'M6 4h12v16H6zM12 13m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  door: 'M4 11 12 4l8 7M6 10v9h12v-9M12 14v5',
  // legacy: keyed by room name, for configs without an explicit icon
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
  const roomIcons = useDash(s => s.roomIcons);
  const room = useDash(s => s.room);
  const setRoom = useDash(s => s.setRoom);
  const entities = useDash(s => s.entities);
  const hideUnavailable = useDash(s => s.hideUnavailable);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const showOther = hasUnassigned(entities, hideUnavailable);
  const items: { key: string; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: 'M3 11 12 4l9 7M5 10v9h14v-9' },
    ...visibleRooms(rooms, entities, hideUnavailable).map(r => ({
      key: r,
      label: r,
      icon: ROOM_ICONS[roomIcons[r] ?? ''] ?? ROOM_ICONS[r] ?? DEFAULT_ICON,
    })),
    ...(showOther ? [{ key: UNASSIGNED, label: 'Other', icon: 'M4 6h16M4 12h16M4 18h10' }] : []),
  ];

  return (
    // phone: docked bottom bar that scrolls sideways. tablet/desktop: left rail.
    // (hover and focus styling comes from the global rules in index.css)
    <nav
      className="z-40 flex flex-none gap-1.5 overflow-x-auto overflow-y-hidden
                 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:px-2 max-md:pt-1.5
                 max-md:pb-[max(0.375rem,env(safe-area-inset-bottom))]
                 md:w-24 md:flex-col md:items-center md:overflow-y-auto md:overflow-x-hidden md:py-4"
      style={{ background: 'var(--side)', backdropFilter: 'var(--blur)' }}>
      {items.map(it => (
        <button key={it.key} onClick={() => setRoom(it.key)}
          className="w-[76px] flex-none rounded-2xl px-1 py-2.5 text-center text-[11px] font-semibold leading-tight transition-colors"
          style={it.key === room
            ? { background: 'var(--side-act)', color: 'var(--acc)' }
            : { color: 'var(--mut)' }}>
          <Icon d={it.icon} />
          {it.label}
        </button>
      ))}
      <button onClick={() => setSettingsOpen(true)} aria-label="Settings"
        className="w-[76px] flex-none rounded-2xl px-1 py-2.5 transition-colors md:mt-auto"
        style={{ color: 'var(--mut)' }}>
        <Icon d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </button>
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </nav>
  );
}
