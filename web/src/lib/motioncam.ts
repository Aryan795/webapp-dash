/**
 * Camera-based motion detection for the wall tablet.
 *
 * Captures the front camera at thumbnail size, downsamples every frame to a
 * GRID_W×GRID_H grayscale grid, and compares each cell against the previous
 * frame. Enough changed cells across two consecutive frames = motion.
 *
 * Cheap by construction: ~3 fps on a 32×24 grid is microseconds of math.
 */

export type CamStatus = 'off' | 'starting' | 'active' | 'denied' | 'unsupported' | 'error';
export type Sensitivity = 'low' | 'medium' | 'high';

const GRID_W = 32;
const GRID_H = 24;
const INTERVAL_MS = 350;
/** cell: min per-cell gray delta (0-255); pct: fraction of cells that must change */
const THRESH: Record<Sensitivity, { cell: number; pct: number }> = {
  low: { cell: 30, pct: 0.12 },
  medium: { cell: 22, pct: 0.06 },
  high: { cell: 15, pct: 0.03 },
};

export class CameraMotion {
  status: CamStatus = 'off';
  onMotion: () => void = () => {};
  onStatus: (s: CamStatus) => void = () => {};
  sensitivity: Sensitivity = 'medium';

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private prev: Float32Array | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private consecutive = 0;
  private skipFrames = 0;

  constructor() {
    this.canvas.width = GRID_W;
    this.canvas.height = GRID_H;
  }

  private setStatus(s: CamStatus): void {
    this.status = s;
    this.onStatus(s);
  }

  async start(): Promise<void> {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      // typical cause: plain-http origin outside Fully Kiosk
      this.setStatus('unsupported');
      return;
    }
    this.setStatus('starting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 160 }, height: { ideal: 120 }, frameRate: { ideal: 5 } },
      });
    } catch (err) {
      this.setStatus((err as Error).name === 'NotAllowedError' ? 'denied' : 'error');
      return;
    }
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = this.stream;
    await v.play().catch(() => {});
    this.video = v;
    this.prev = null;
    this.skipFrames = 4; // let exposure settle
    this.timer = setInterval(() => this.sample(), INTERVAL_MS);
    this.setStatus('active');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.video = null;
    this.prev = null;
    this.setStatus('off');
  }

  /** Call on screen sleep/wake: the lighting shift must not read as motion. */
  rebaseline(): void {
    this.skipFrames = 8;
    this.consecutive = 0;
  }

  private sample(): void {
    const v = this.video;
    if (!v || v.readyState < 2) return;
    this.ctx.drawImage(v, 0, 0, GRID_W, GRID_H);
    const { data } = this.ctx.getImageData(0, 0, GRID_W, GRID_H);
    const cur = new Float32Array(GRID_W * GRID_H);
    for (let i = 0; i < cur.length; i++) {
      const o = i * 4;
      cur[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }
    this.compare(cur);
  }

  /** Shared by the live path and tests. */
  compare(cur: Float32Array): void {
    const prev = this.prev;
    this.prev = cur;
    if (this.skipFrames > 0) { this.skipFrames--; this.consecutive = 0; return; }
    if (!prev) return;
    const { cell, pct } = THRESH[this.sensitivity];
    let changed = 0;
    for (let i = 0; i < cur.length; i++) {
      if (Math.abs(cur[i] - prev[i]) > cell) changed++;
    }
    if (changed / cur.length >= pct) {
      // two consecutive motion frames filters sensor noise and light flicker
      this.consecutive++;
      if (this.consecutive >= 2) {
        this.consecutive = 0;
        this.onMotion();
      }
    } else {
      this.consecutive = 0;
    }
  }
}

export const GRID_CELLS = GRID_W * GRID_H;
