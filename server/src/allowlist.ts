/**
 * Only these domain.service pairs may be invoked from a tablet. Everything
 * else (hassio.*, shell_command.*, homeassistant.restart, ...) is rejected
 * server-side so a compromised kiosk browser cannot touch them.
 */
const ALLOW: Record<string, ReadonlySet<string>> = {
  light: new Set(['turn_on', 'turn_off', 'toggle']),
  switch: new Set(['turn_on', 'turn_off', 'toggle']),
  input_boolean: new Set(['turn_on', 'turn_off', 'toggle']),
  fan: new Set(['turn_on', 'turn_off', 'toggle', 'set_percentage', 'set_preset_mode', 'oscillate']),
  climate: new Set(['set_temperature', 'set_hvac_mode', 'set_fan_mode', 'turn_on', 'turn_off']),
  cover: new Set(['open_cover', 'close_cover', 'stop_cover', 'set_cover_position']),
  media_player: new Set([
    'media_play', 'media_pause', 'media_play_pause', 'media_next_track',
    'media_previous_track', 'volume_set', 'volume_mute', 'turn_on', 'turn_off',
  ]),
  script: new Set(['turn_on']),
  number: new Set(['set_value']),
  select: new Set(['select_option']),
  counter: new Set(['increment', 'decrement', 'reset']),
};

export function isAllowed(domain: string, service: string): boolean {
  return ALLOW[domain]?.has(service) ?? false;
}
