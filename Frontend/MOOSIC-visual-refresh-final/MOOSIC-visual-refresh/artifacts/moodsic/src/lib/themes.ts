export type Atmosphere = 'aurora' | 'particles' | 'waves' | 'threads' | 'iridescence';
export type RoomTheme = { name: string; color: string; accent: string; background: string; effect: Atmosphere };

// Keep saved color keys compatible, but use them as accents on near-black rooms.
export const themePalette: RoomTheme[] = [
  { name: 'Rose After Hours', color: '#b34b4b', accent: '#cc939a', background: '#100b10', effect: 'threads' },
  { name: 'Moss & Moonlight', color: '#78ba61', accent: '#94b8a1', background: '#090f0d', effect: 'waves' },
  { name: 'Oxblood', color: '#7f0202', accent: '#bd7974', background: '#100909', effect: 'iridescence' },
  { name: 'Blue Hour', color: '#4d7fde', accent: '#829ece', background: '#080c14', effect: 'aurora' },
  { name: 'Velvet Haze', color: '#c860ca', accent: '#b49bcf', background: '#100b16', effect: 'iridescence' },
  { name: 'Tidal Ink', color: '#3aaaa1', accent: '#7fb9b4', background: '#070f11', effect: 'waves' },
  { name: 'Ember Room', color: '#ee933f', accent: '#c3a074', background: '#120e09', effect: 'particles' },
  { name: 'Rose Static', color: '#ea3b94', accent: '#c387a9', background: '#110b12', effect: 'threads' },
];

export const moodThemes: Record<string, RoomTheme> = {
  Sad: { name: 'Blue hour', color: '#829ece', accent: '#829ece', background: '#080c14', effect: 'aurora' },
  Happy: { name: 'Afterglow', color: '#c3a074', accent: '#c3a074', background: '#120e09', effect: 'particles' },
  Neutral: { name: 'Soft focus', color: '#b49bcf', accent: '#b49bcf', background: '#100b16', effect: 'iridescence' },
  Exhausted: { name: 'Low tide', color: '#7fb9ac', accent: '#7fb9ac', background: '#080f0e', effect: 'waves' },
  Angry: { name: 'Slow burn', color: '#c18779', accent: '#c18779', background: '#120b0b', effect: 'threads' },
};

export function resolveRoomTheme(color?: string): RoomTheme {
  return [...themePalette, ...Object.values(moodThemes)].find(theme => theme.color === color || theme.background === color) ?? moodThemes.Neutral;
}
