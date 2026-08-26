import { EventEmitter } from 'node:events';
import type { StateCache, Entity } from './state-cache.ts';
import { dashboardConfig, onConfigChange } from './config.ts';

export type ScreenState = 'awake' | 'asleep';

/**
 * Motion-driven screen state machine.
 * Any configured motion/occupancy sensor turning `on` wakes the tablet;
 * all sensors clear for `offDelayMinutes` puts it to sleep.
 *
 * Two delivery paths, both used when available:
 *  - emits 'change' → index.ts broadcasts {type:'screen'} to every tablet
 *    (drives the Fully JS API and the dim-overlay fallback client-side)
 *  - Fully Kiosk Remote Admin REST, called from here so the screen wakes
 *    even if the page's JS is throttled while the display is off.
 */
export class ScreenController extends EventEmitter {
  state: ScreenState = 'awake';
  private offTimer: ReturnType<typeof setTimeout> | null = null;

  private cache: StateCache;

  constructor(cache: StateCache) {
    super();
    this.cache = cache;
    cache.on('patch', (e: Entity) => this.onEntity(e));
    cache.on('reset', () => this.rearm());
    onConfigChange(() => this.rearm());
    this.rearm();
  }

  private watched(): Set<string> {
    const cfg = dashboardConfig().screen;
    if (cfg.motionSensors.length) return new Set(cfg.motionSensors);
    const all = this.cache.snapshot().entities.filter(e =>
      e.entity_id.startsWith('binary_sensor.') &&
      ['motion', 'occupancy'].includes(String(e.attributes.device_class)));
    return new Set(all.map(e => e.entity_id));
  }

  private onEntity(e: Entity): void {
    if (!this.watched().has(e.entity_id)) return;
    if (e.state === 'on') this.wake(`motion: ${e.entity_id}`);
    else this.rearm(); // a sensor cleared — restart the countdown if all are clear
  }

  private anyMotion(): boolean {
    const w = this.watched();
    return this.cache.snapshot().entities.some(e => w.has(e.entity_id) && e.state === 'on');
  }

  wake(reason: string): void {
    this.clearTimer();
    if (this.state !== 'awake') {
      this.state = 'awake';
      console.log(`screen: wake (${reason})`);
      this.emit('change', this.state);
      void this.fully('screenOn');
    }
    this.rearm();
  }

  private rearm(): void {
    this.clearTimer();
    const mins = dashboardConfig().screen.offDelayMinutes;
    if (mins <= 0 || this.anyMotion()) return;
    this.offTimer = setTimeout(() => {
      if (this.anyMotion()) { this.rearm(); return; }
      if (this.state !== 'asleep') {
        this.state = 'asleep';
        console.log(`screen: sleep (no motion for ${mins} min)`);
        this.emit('change', this.state);
        void this.fully('screenOff');
      }
    }, mins * 60_000);
  }

  private clearTimer(): void {
    if (this.offTimer) clearTimeout(this.offTimer);
    this.offTimer = null;
  }

  /** Fully Kiosk Remote Admin (needs PLUS license on the tablet). */
  private async fully(cmd: 'screenOn' | 'screenOff'): Promise<void> {
    const { fullyHost, fullyPassword } = dashboardConfig().screen;
    if (!fullyHost) return;
    const url = `http://${fullyHost}:2323/?cmd=${cmd}&type=json&password=${encodeURIComponent(fullyPassword)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) console.warn(`fully ${cmd} -> HTTP ${res.status}`);
    } catch (err) {
      console.warn(`fully ${cmd} failed:`, (err as Error).message);
    }
  }
}
