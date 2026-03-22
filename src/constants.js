export const COLORS = {
  // Backgrounds
  bg0: '#050810',
  bg1: '#090D14',
  bg2: '#0D1320',
  bg3: '#111827',
  bg4: '#1A2335',
  borderDim: '#1E2D42',
  border: '#243550',
  borderBright: '#2E4468',

  // Accent
  accent: '#00C8FF',
  accentDim: '#0087AA',

  // Events
  kill:  '#3B82F6',
  death: '#EF4444',
  loot:  '#22C55E',
  storm: '#FACC15',

  // Player paths
  humanPalette: ['#3B82F6','#22C55E','#F97316','#A78BFA','#EC4899','#14B8A6','#F59E0B','#EF4444'],
  botPath: '#94A3B8',

  // Text
  text0: '#FFFFFF',
  text1: '#E2E8F0',
  text2: '#94A3B8',
  text3: '#4B6280',
  text4: '#2A3F57',
};

export const EVENTS = {
  'Kill':          { color: '#3B82F6', size: 8, label: 'Kill' },
  'BotKill':       { color: '#3B82F6', size: 8, label: 'Bot Kill' },
  'Killed':        { color: '#EF4444', size: 8, label: 'Death' },
  'BotKilled':     { color: '#EF4444', size: 8, label: 'Bot Death' },
  'Loot':          { color: '#22C55E', size: 6, label: 'Loot' },
  'KilledByStorm': { color: '#FACC15', size: 8, label: 'Storm Death' },
};

export const MAPS = ['AmbroseValley', 'GrandRift', 'Lockdown'];

export const MINIMAP_SIZE = 1024;

export const FONTS = {
  display:   "'Rajdhani', sans-serif",
  ui:        "'Barlow', sans-serif",
  mono:      "'JetBrains Mono', monospace",
  condensed: "'Barlow Condensed', sans-serif",
};

export const HEATMAP_COLOR_SCALE = [
  [0.0,  'rgba(0,0,0,0)'],
  [0.25, 'rgba(250,204,21,0.55)'],
  [0.6,  'rgba(249,115,22,0.70)'],
  [1.0,  'rgba(239,68,68,0.85)'],
];
