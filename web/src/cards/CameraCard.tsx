import { useEffect, useState } from 'react';
import type { Entity } from '../types';
import { isUnavailable } from '../store/entities';
import { CardShell } from './base';

export default function CameraCard({ e }: { e: Entity }) {
  const unavail = isUnavailable(e);
  const [tick, setTick] = useState(0);

  // refresh the proxied snapshot every 10 s while the camera is available
  useEffect(() => {
    if (unavail) return;
    const t = setInterval(() => setTick(x => x + 1), 10_000);
    return () => clearInterval(t);
  }, [unavail]);

  return (
    <CardShell e={e} color="var(--c-sensor)" icon="camera" active={false}
      sub={unavail ? 'Unavailable' : 'Live snapshot'}>
      {!unavail && (
        <img src={`/api/camera/${e.entity_id}?t=${tick}`} alt=""
          className="mt-auto h-24 w-full rounded-lg object-cover"
          onError={ev => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
      )}
    </CardShell>
  );
}
