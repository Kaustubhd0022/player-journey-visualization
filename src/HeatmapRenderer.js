import { COLORS } from './constants';

const COLOR_SCALES = {
  kill: [
    { stop: 0.00, rgba: [0,   0,   0,   0]   },
    { stop: 0.25, rgba: [59,  130, 246, 140]  },
    { stop: 0.60, rgba: [29,  78,  216, 180]  },
    { stop: 1.00, rgba: [30,  58,  138, 210]  },
  ],
  death: [
    { stop: 0.00, rgba: [0,   0,   0,   0]   },
    { stop: 0.25, rgba: [250, 204, 21,  130]  },
    { stop: 0.60, rgba: [249, 115, 22,  170]  },
    { stop: 1.00, rgba: [239, 68,  68,  210]  },
  ],
  movement: [
    { stop: 0.00, rgba: [0,   0,   0,   0]   },
    { stop: 0.25, rgba: [34,  197, 94,  100]  },
    { stop: 0.60, rgba: [21,  128, 61,  160]  },
    { stop: 1.00, rgba: [20,  83,  45,  200]  },
  ],
  landing: [
    { stop: 0.0,  rgba: [0,   0,   0,   0]   },    // transparent
    { stop: 0.15, rgba: [139, 92,  246, 80]   },    // light purple
    { stop: 0.4,  rgba: [109, 40,  217, 150]  },    // mid purple
    { stop: 0.7,  rgba: [76,  29,  149, 190]  },    // deep purple
    { stop: 1.0,  rgba: [0,   200, 255, 220]  },    // cyan peak = hottest LZ
  ],
};

function interpolateColor(val, scale) {
  const clamped = Math.max(0, Math.min(1, val));
  for (let i = 1; i < scale.length; i++) {
    if (clamped <= scale[i].stop) {
      const t = (clamped - scale[i-1].stop) / (scale[i].stop - scale[i-1].stop);
      return scale[i-1].rgba.map((c, j) => Math.round(c + (scale[i].rgba[j] - c) * t));
    }
  }
  return scale[scale.length - 1].rgba;
}

export function gridToBase64(grid, mode = 'kill') {
  if (!grid || grid.length === 0) {
    console.warn('gridToBase64: empty grid passed for mode', mode);
    return '';
  }

  const scale = COLOR_SCALES[mode] || COLOR_SCALES.death;
  if (!COLOR_SCALES[mode]) {
    console.warn('gridToBase64: unknown mode', mode, '— falling back to death scale');
  }

  const size   = grid.length;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx    = canvas.getContext('2d');
  const img    = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const val = Math.max(0, Math.min(1, grid[y]?.[x] || 0));
      const [r, g, b, a] = interpolateColor(val, scale);
      const i = (y * size + x) * 4;
      img.data[i]   = r;
      img.data[i+1] = g;
      img.data[i+2] = b;
      img.data[i+3] = a;
    }
  }

  ctx.putImageData(img, 0, 0);
  const result = canvas.toDataURL('image/png');
  console.log('gridToBase64 result for mode', mode, '— length:', result.length);
  return result;
}

export function landingGridToBase64(grid) {
  return gridToBase64(grid, 'landing');
}

export function generateFallbackGrid(events, mode) {
  const size = 64;
  const grid = Array(size).fill(0).map(() => Array(size).fill(0));
  if (!events || events.length === 0) return grid;
  
  const relevantList = events.filter(e => {
    if (mode === 'kill') return e.event === 'Kill' || e.event === 'BotKill';
    if (mode === 'death') return e.event === 'Killed' || e.event === 'BotKilled' || e.event === 'KilledByStorm';
    if (mode === 'movement' || mode === 'landing') return e.event === 'Position' || e.event === 'BotPosition';
    return false;
  }).filter(e => typeof e.px === 'number' && typeof e.py === 'number' && !isNaN(e.px) && !isNaN(e.py));

  if (relevantList.length === 0) return grid;

  relevantList.forEach(e => {
    let gx = Math.floor((e.px / 1024) * size);
    let gy = Math.floor((e.py / 1024) * size);
    if (gx < 0) gx = 0; if (gx >= size) gx = size - 1;
    if (gy < 0) gy = 0; if (gy >= size) gy = size - 1;
    grid[gy][gx] += 1;
  });

  // Fast gaussian-like blur
  const blurred = Array(size).fill(0).map(() => Array(size).fill(0));
  let maxVal = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (y+dy >= 0 && y+dy < size && x+dx >= 0 && x+dx < size) {
            const w = Math.exp(-(dx*dx + dy*dy)/4);
            sum += grid[y+dy][x+dx] * w;
            count += w;
          }
        }
      }
      const val = sum / count;
      blurred[y][x] = val;
      if (val > maxVal) maxVal = val;
    }
  }

  // Normalize 0 to 1
  if (maxVal > 0) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        blurred[y][x] /= maxVal;
      }
    }
  }

  return blurred;
}
