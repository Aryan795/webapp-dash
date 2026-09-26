import { useEffect } from 'react';
import { useDash, visibleRooms, hasUnassigned } from './store/entities';
import { UNASSIGNED } from './types';
import { deviceRole } from './lib/device';
import Sidebar from './layout/Sidebar';
import Header from './layout/Header';
import RoomGrid from './layout/RoomGrid';
import HomeGlance from './layout/HomeGlance';
import SleepOverlay from './layout/SleepOverlay';

export default function App() {
  const theme = useDash(s => s.theme);
  const reduceFx = useDash(s => s.reduceFx);
  const room = useDash(s => s.room);
  const setRoom = useDash(s => s.setRoom);
  // the server's first snapshot after a restart is empty until HA answers
  const loading = useDash(s => !s.ready || Object.keys(s.entities).length === 0);
  // the remembered room may since have been renamed or emptied — but an empty
  // snapshot is not evidence of that, so only judge once there is data
  const roomExists = useDash(s => s.room === 'home' || Object.keys(s.entities).length === 0
    || (s.room === UNASSIGNED
      ? hasUnassigned(s.entities, s.hideUnavailable)
      : visibleRooms(s.rooms, s.entities, s.hideUnavailable).includes(s.room)));

  useEffect(() => {
    document.documentElement.dataset.th = theme;
    document.documentElement.dataset.fx = reduceFx ? 'off' : 'on';
    document.documentElement.dataset.role = deviceRole();
  }, [theme, reduceFx]);

  useEffect(() => {
    if (!loading && !roomExists) setRoom('home');
  }, [loading, roomExists, setRoom]);

  return (
    // column on a phone (nav docks to the bottom), row from tablet width up
    <div className="flex h-full flex-col md:flex-row">
      <Sidebar />
      <main className="app-main flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto p-3 sm:px-5 sm:pt-5 md:p-5">
        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3.5">
          <Header />
          {loading
            ? <div className="grid flex-1 place-items-center text-[var(--mut)]">Connecting…</div>
            : room === 'home' || !roomExists ? <HomeGlance /> : <RoomGrid room={room} />}
        </div>
      </main>
      <SleepOverlay />
    </div>
  );
}
