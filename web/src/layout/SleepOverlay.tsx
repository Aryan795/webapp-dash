import { useDash, wakeScreen } from '../store/entities';

/**
 * Soft-off fallback for browsers without a kiosk screen API: a near-black
 * layer over everything. Inside Fully Kiosk the screen is truly off instead
 * (fully.turnScreenOff), so this layer is simply never seen.
 * Any tap wakes the panel and tells the server to restart its motion timer.
 */
export default function SleepOverlay() {
  const asleep = useDash(s => s.screen === 'asleep');
  if (!asleep) return null;
  return (
    <div
      className="fixed inset-0 z-[100]"
      style={{ background: '#000', opacity: 0.97, cursor: 'none' }}
      onPointerDown={() => wakeScreen('tap')}
      aria-label="Screen sleeping — tap to wake"
    />
  );
}
