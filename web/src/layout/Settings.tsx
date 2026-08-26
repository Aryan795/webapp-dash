import { useDash } from '../store/entities';
import type { Sensitivity } from '../lib/motioncam';

const THEMES: [string, string][] = [
  ['mushroom', '🍄 Mushroom Dusk'], ['glass', '🧊 Prism Glass'], ['mocha', '🐱 Catppuccin Mocha'],
  ['minimal', '◻ Minimalist Light'], ['slate', '🌙 Midnight Slate'], ['homekit', '🏠 HomeKit Graphite'],
  ['nord', '❄️ Nord Frost'], ['gruvbox', '🔥 Gruvbox Hearth'], ['amoled', '⬛ AMOLED Neon'],
  ['eink', '📄 E-ink Paper'], ['md3', '🎨 Material You'], ['luxe', '🥂 Photo Luxe'],
];

export default function Settings({ onClose }: { onClose: () => void }) {
  const theme = useDash(s => s.theme);
  const setTheme = useDash(s => s.setTheme);
  const hideUnavailable = useDash(s => s.hideUnavailable);
  const setHideUnavailable = useDash(s => s.setHideUnavailable);
  const reduceFx = useDash(s => s.reduceFx);
  const setReduceFx = useDash(s => s.setReduceFx);
  const camWake = useDash(s => s.camWake);
  const setCamWake = useDash(s => s.setCamWake);
  const camSensitivity = useDash(s => s.camSensitivity);
  const setCamSensitivity = useDash(s => s.setCamSensitivity);
  const camStatus = useDash(s => s.camStatus);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50" onClick={onClose}>
      <div className="card w-[520px] max-w-[92vw] p-6" onClick={e => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold">Settings</h3>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.16em]" style={{ color: 'var(--mut)' }}>Theme</p>
        <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-3">
          {THEMES.map(([key, label]) => (
            <button key={key} onClick={() => setTheme(key)}
              className="rounded-xl border px-3 py-2.5 text-left text-xs font-semibold"
              style={key === theme
                ? { borderColor: 'var(--acc)', color: 'var(--acc)', background: 'color-mix(in srgb, var(--acc) 12%, transparent)' }
                : { borderColor: 'var(--brd)', color: 'var(--tx)' }}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={hideUnavailable}
            onChange={e => setHideUnavailable(e.target.checked)}
            className="h-5 w-5 accent-[var(--acc)]" />
          Hide unavailable devices
        </label>
        <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={reduceFx}
            onChange={e => setReduceFx(e.target.checked)}
            className="h-5 w-5 accent-[var(--acc)]" />
          Reduce effects (older tablets: no blur/animations)
        </label>
        <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={camWake}
            onChange={e => setCamWake(e.target.checked)}
            className="h-5 w-5 accent-[var(--acc)]" />
          Camera motion wake (tablet front camera)
        </label>
        {camWake && (
          <div className="mt-2 flex items-center gap-3 pl-8 text-sm">
            <select value={camSensitivity}
              onChange={e => setCamSensitivity(e.target.value as Sensitivity)}
              className="rounded-lg border bg-transparent px-2 py-1.5"
              style={{ borderColor: 'var(--brd)', color: 'var(--tx)' }}>
              <option value="low" style={{ color: '#111' }}>Low sensitivity</option>
              <option value="medium" style={{ color: '#111' }}>Medium sensitivity</option>
              <option value="high" style={{ color: '#111' }}>High sensitivity</option>
            </select>
            <span style={{ color: camStatus === 'active' ? 'var(--acc)' : 'var(--mut)' }}>
              {{ off: 'off', starting: 'starting…', active: '● watching',
                 denied: 'camera permission denied',
                 unsupported: 'not available — needs HTTPS or Fully Kiosk webcam access',
                 error: 'camera error' }[camStatus]}
            </span>
          </div>
        )}
        <button onClick={onClose} className="mt-5 w-full rounded-xl py-3 font-bold"
          style={{ background: 'var(--acc)', color: 'var(--wall)' }}>
          Done
        </button>
      </div>
    </div>
  );
}
