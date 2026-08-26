import type { ReactNode } from 'react';
import type { Entity } from '../types';
import { domainOf } from '../types';
import LightCard from './LightCard';
import SwitchCard from './SwitchCard';
import FanCard from './FanCard';
import ClimateCard from './ClimateCard';
import CoverCard from './CoverCard';
import MediaCard from './MediaCard';
import CameraCard from './CameraCard';
import SensorCard from './SensorCard';
import BinarySensorCard from './BinarySensorCard';
import GenericCard from './GenericCard';

/** The extension point: add a domain → component mapping and it shows up everywhere. */
export function cardFor(e: Entity, opts?: { wide?: boolean }): ReactNode {
  switch (domainOf(e.entity_id)) {
    case 'light': return <LightCard key={e.entity_id} e={e} />;
    case 'switch':
    case 'input_boolean': return <SwitchCard key={e.entity_id} e={e} />;
    case 'fan': return <FanCard key={e.entity_id} e={e} />;
    case 'climate': return <ClimateCard key={e.entity_id} e={e} wide={opts?.wide ?? true} />;
    case 'cover': return <CoverCard key={e.entity_id} e={e} />;
    case 'media_player': return <MediaCard key={e.entity_id} e={e} />;
    case 'camera': return <CameraCard key={e.entity_id} e={e} />;
    case 'sensor': return <SensorCard key={e.entity_id} e={e} />;
    case 'binary_sensor': return <BinarySensorCard key={e.entity_id} e={e} />;
    case 'weather': return null; // rendered in the header, not as a card
    default: return <GenericCard key={e.entity_id} e={e} />;
  }
}
