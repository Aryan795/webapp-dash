import { useEffect, useState } from 'react';
import { useDash } from '../store/entities';
import { UNASSIGNED } from '../types';

const WEATHER_ICONS: Record<string, string> = {
  'clear-night': '🌙', cloudy: '☁️', fog: '🌫️', hail: '🌨️', lightning: '⛈️',
  'lightning-rainy': '⛈️', partlycloudy: '⛅', pouring: '🌧️', rainy: '🌦️',
  snowy: '🌨️', 'snowy-rainy': '🌨️', sunny: '☀️', windy: '🌬️',
};

export default function Header() {
  const room = useDash(s => s.room);
  const link = useDash(s => s.link);
  const haStatus = useDash(s => s.haStatus);
  const weather = useDash(s => Object.values(s.entities).find(e => e.entity_id.startsWith('weather.')));
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const live = link && haStatus === 'connected';
  const title = room === 'home'
    ? `Good ${now.getHours() < 5 ? 'night' : now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}`
    : room === UNASSIGNED ? 'Other' : room;

  return (
    <div className="flex items-baseline gap-4">
      <h2 className="room-title m-0 text-[1.6rem] font-semibold tracking-tight">{title}</h2>
      <span className="text-sm tabular-nums" style={{ color: 'var(--mut)' }}>
        {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
      </span>
      {!live && (
        <span className="rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: 'color-mix(in srgb, #E5484D 18%, transparent)', color: '#E5484D' }}>
          {link ? 'HA reconnecting…' : 'reconnecting…'}
        </span>
      )}
      {weather && (
        <span className="ml-auto flex items-center gap-2 text-sm" style={{ color: 'var(--mut)' }}>
          {WEATHER_ICONS[weather.state] ?? '🌡️'}
          <b className="text-lg font-semibold" style={{ color: 'var(--tx)' }}>
            {String(weather.attributes.temperature ?? '–')}°
          </b>
          {String(weather.state).replace(/-/g, ' ')}
          {weather.attributes.humidity != null && <> · H {String(weather.attributes.humidity)}%</>}
        </span>
      )}
    </div>
  );
}
