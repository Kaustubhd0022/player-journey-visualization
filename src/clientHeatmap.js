/**
 * Client-side Heatmap Calculation
 * Replaces scipy.stats.gaussian_kde with a simple grid-based density approach + Gaussian blur.
 */

const GRID_SIZE = 64;
const MAP_SIZE = 1024;

export function computeClientHeatmaps(events) {
  const result = {};

  const categories = [
    { key: 'kill_human',     types: ['Kill', 'Victory', 'KillEvent'], selector: e => e.player_type === 'human' || !e.is_bot },
    { key: 'kill_bot',       types: ['BotKill', 'Kill', 'KillEvent'], selector: e => e.player_type === 'bot' || e.is_bot },
    { key: 'kill_all',       types: ['Kill', 'BotKill', 'Victory', 'KillEvent', 'Death'], selector: () => true },
    
    { key: 'death_human',    types: ['Killed', 'KilledByStorm', 'Death', 'KilledEvent'], selector: e => e.player_type === 'human' || !e.is_bot },
    { key: 'death_bot',      types: ['BotKilled', 'BotDeath', 'Killed', 'Death'], selector: e => e.player_type === 'bot' || e.is_bot },
    { key: 'death_all',      types: ['Killed', 'BotKilled', 'KilledByStorm', 'Death', 'BotDeath', 'KilledEvent'], selector: () => true },
    
    { key: 'movement_human', types: ['Position'],                selector: e => e.player_type === 'human' || !e.is_bot },
    { key: 'movement_bot',   types: ['BotPosition', 'Position'], selector: e => e.player_type === 'bot' || e.is_bot },
    { key: 'movement_all',   types: ['Position', 'BotPosition'], selector: () => true },
  ];

  for (const cat of categories) {
    let filtered = events.filter(e => cat.types.includes(e.event) && cat.selector(e));

    if (filtered.length < 1) { // Accept even 1 point for sparse uploads
      console.warn(`Empty heatmap category: ${cat.key} (found ${filtered.length} events)`);
      result[cat.key] = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));
      continue;
    }
    
    console.log(`Computing heatmap for ${cat.key}: ${filtered.length} points found`);

    // 1. Create density grid
    const grid = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));
    for (const e of filtered) {
      const gx = Math.min(GRID_SIZE - 1, Math.floor((e.px / MAP_SIZE) * GRID_SIZE));
      const gy = Math.min(GRID_SIZE - 1, Math.floor((e.py / MAP_SIZE) * GRID_SIZE));
      if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
        grid[gy][gx] += 1;
      }
    }

    // 2. Apply Gaussian blur (5x5 kernel)
    const blurred = applyGaussianBlur(grid);

    // 3. Normalize to 0-1
    let max = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (blurred[y][x] > max) max = blurred[y][x];
      }
    }

    if (max > 0) {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          blurred[y][x] = parseFloat((blurred[y][x] / max).toFixed(4));
        }
      }
    }

    result[cat.key] = blurred;
  }

  return result;
}

function applyGaussianBlur(grid) {
  const kernel = [
    [1, 4, 7, 4, 1],
    [4, 16, 26, 16, 4],
    [7, 26, 41, 26, 7],
    [4, 16, 26, 16, 4],
    [1, 4, 7, 4, 1]
  ];
  const kernelSum = 273; // Sum of all kernel elements

  const result = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      let sum = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          const iy = y + ky;
          const ix = x + kx;
          if (iy >= 0 && iy < GRID_SIZE && ix >= 0 && ix < GRID_SIZE) {
            sum += grid[iy][ix] * kernel[ky + 2][kx + 2];
          }
        }
      }
      result[y][x] = sum / kernelSum;
    }
  }

  return result;
}
