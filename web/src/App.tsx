import { useEffect } from 'react';
import { useDash } from './store/entities';
import Sidebar from './layout/Sidebar';
import Header from './layout/Header';
import RoomGrid from './layout/RoomGrid';
import HomeGlance from './layout/HomeGlance';
import SleepOverlay from './layout/SleepOverlay';

export default function App() {
  const theme = useDash(s => s.theme);
  const reduceFx = useDash(s => s.reduceFx);
  const room = useDash(s => s.room);
  const ready = useDash(s => s.ready);

  useEffect(() => {
    document.documentElement.dataset.th = theme;
    document.documentElement.dataset.fx = reduceFx ? 'off' : 'on';
  }, [theme, reduceFx]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col gap-3.5 overflow-y-auto p-5">
        <Header />
        {!ready
          ? <div className="grid flex-1 place-items-center text-[var(--mut)]">Connecting…</div>
          : room === 'home' ? <HomeGlance /> : <RoomGrid room={room} />}
      </main>
      <SleepOverlay />
    </div>
  );
}
