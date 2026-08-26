import type { ReactNode, CSSProperties } from 'react';
import type { Entity } from '../types';
import { isUnavailable } from '../store/entities';

export const friendly = (e: Entity): string => {
  const n = String(e.attributes.friendly_name ?? e.entity_id.split('.')[1].replace(/_/g, ' '));
  return n.replace(/^(.{3,}?)\s+\1/i, '$1'); // "Panasonic AC Panasonic AC" -> "Panasonic AC"
};

const ICON_PATHS: Record<string, string> = {
  light: 'M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.6-1 2.5H9c0-.9-.2-1.8-1-2.5A6 6 0 0 1 12 3Z',
  led: 'M4 8c3 0 3 3 6 3s3-3 6-3 3 3 4 3M4 15c3 0 3 3 6 3s3-3 6-3 3 3 4 3',
  switch: 'M7 8h10a4 4 0 0 1 0 8H7a4 4 0 0 1 0-8ZM9 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  fan: 'M12 12m-2.4 0a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0M12 9.6C12 5 9 3.5 6.5 5.5S6 12 9.6 12M14.4 12c4.6 0 6.1-3 4.1-5.5S12 6 12 9.6M12 14.4c0 4.6 3 6.1 5.5 4.1S18 12 14.4 12M9.6 12C5 12 3.5 15 5.5 17.5S12 18 12 14.4',
  climate: 'M12 3v18M5 6l14 12M19 6 5 18M3 12h18',
  cover: 'M4 4h16v16H4zM4 8h16M4 11h16',
  media_player: 'M5 3h14v18H5zM12 14m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M12 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  camera: 'M4 7h4l2-2h4l2 2h4v12H4zM12 13m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
  sensor: 'M10 4a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0ZM12 17m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
  motion: 'M12 7m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M7 21c0-4 2-7 5-7s5 3 5 7',
  energy: 'M13 3 5 13h5l-1 8 8-10h-5z',
  script: 'M8 4h10v16H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM10 9h5M10 13h5',
  generic: 'M4 7h16v12H4zM12 7v12',
};

export function DomainIcon({ kind }: { kind: string }) {
  const d = ICON_PATHS[kind] ?? ICON_PATHS.generic;
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}
    </svg>
  );
}

interface ShellProps {
  e: Entity;
  color: string;          // css var for the domain accent
  icon: string;           // ICON_PATHS key
  active: boolean;
  sub: string;
  onTap?: () => void;
  children?: ReactNode;   // extra controls under the title row
  wide?: boolean;
}

export function CardShell({ e, color, icon, active, sub, onTap, children, wide }: ShellProps) {
  const unavail = isUnavailable(e);
  return (
    <div
      className={[
        'card flex min-h-[108px] flex-col gap-2 p-4',
        active && !unavail ? 'active' : '',
        e.pending ? 'pending' : '',
        unavail ? 'unavail' : '',
        onTap && !unavail ? 'cursor-pointer' : '',
        wide ? 'col-span-2' : '',
      ].join(' ')}
      style={{ '--dc': color } as CSSProperties}
      onClick={unavail ? undefined : onTap}
    >
      <div className="flex items-center gap-2.5">
        <span className="chip-ic"><DomainIcon kind={icon} /></span>
        <div className="min-w-0">
          <div className="card-name truncate text-[13px] font-semibold">{friendly(e)}</div>
          <div className="card-sub text-xs" style={{ color: 'var(--mut)' }}>
            {unavail ? 'Unavailable' : sub}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
