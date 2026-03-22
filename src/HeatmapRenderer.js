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
};

function interpolateColor(val, scale) {
  for (let i = 1; i < scale.length; i++) {
    if (val <= scale[i].stop) {
      const t = (val - scale[i-1].stop) / (scale[i].stop - scale[i-1].stop);
      return scale[i-1].rgba.map((c, j) => Math.round(c + (scale[i].rgba[j] - c) * t));
    }
  }
  return scale[scale.length - 1].rgba;
}

export function gridToBase64(grid, mode = 'kill') {
  if (!grid || !grid.length) return null;
  const size = grid.length;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const scale = COLOR_SCALES[mode] || COLOR_SCALES.death;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const val = Math.max(0, Math.min(1, grid[y][x]));
      const [r, g, b, a] = interpolateColor(val, scale);
      const i = (y * size + x) * 4;
      imgData.data[i]   = r;
      imgData.data[i+1] = g;
      imgData.data[i+2] = b;
      imgData.data[i+3] = a;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
