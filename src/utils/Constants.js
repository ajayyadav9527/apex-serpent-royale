// utils/Constants.js
// FROZEN — see ARCHITECTURE.md §12. Do not change without @architect approval.

export const GAME_CONSTANTS = {
  ARENA_SIZE:        1000,
  ZONE_SHRINK_TIME:  300,   // seconds to shrink from r=450 → r=50
  TICK_RATE:          20,   // server authoritative ticks per second
  MAX_PLAYERS:        64,
  MAX_BOTS:           20,
  BASE_SPEED:          0.15,
  FOOD_VALUE:           1,  // segments added per food
  SEGMENT_SPACING:     0.9,
  ZONE_DAMAGE_PER_SEC: 2,
  MAX_SEGMENTS:       200,
  SPEED_CAP_MULTIPLIER: 1.5,
};

export const POWERUP_TYPES = {
  SPEED_BOOST:  'speed_boost',
  SHIELD:       'shield',
  VENOM_SPIT:   'venom_spit',
  GHOST:        'ghost',
  MAGNET:       'magnet',
  BOMB:         'bomb',
};

export const POWERUP_COLORS = {
  speed_boost: 0x00ffff,
  shield:      0x4488ff,
  venom_spit:  0xff4400,
  ghost:       0xaaaaff,
  magnet:      0xffff00,
  bomb:        0xff0000,
};

export const AD_UNIT_IDS = {
  LEADERBOARD:   'asr-ad-leaderboard',
  RECTANGLE:     'asr-ad-rectangle',
  MOBILE_FOOTER: 'asr-ad-mobile-footer',
  INTERSTITIAL:  'asr-ad-interstitial',
};

export const EVENTS = {
  GAME_START:        'game:start',
  GAME_OVER:         'game:over',
  SNAKE_DIE:         'snake:die',
  FOOD_COLLECT:      'food:collect',
  POWERUP_COLLECT:   'powerup:collect',
  ZONE_WARNING:      'zone:warning',
  AUDIO_MUTE:        'audio:mute',
};
