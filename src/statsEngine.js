// Safe min/max using reduce to avoid call stack overflow on large arrays
function safeMax(arr, defaultVal = 0) {
  if (!arr || arr.length === 0) return defaultVal;
  return arr.reduce((m, v) => (v > m ? v : m), arr[0]);
}
function safeMin(arr, defaultVal = 0) {
  if (!arr || arr.length === 0) return defaultVal;
  return arr.reduce((m, v) => (v < m ? v : m), arr[0]);
}

export function computeStats(events) {
  if (!events || events.length === 0) return null;

  const discrete  = events.filter(e => e.event !== 'Position' && e.event !== 'BotPosition');
  const positions = events.filter(e => e.event === 'Position');

  const kills  = discrete.filter(e => e.event === 'Kill' || e.event === 'BotKill');
  const deaths = discrete.filter(e => e.event === 'Killed');
  const loot   = discrete.filter(e => e.event === 'Loot');
  const storm  = discrete.filter(e => e.event === 'KilledByStorm');

  const humanIds = [...new Set(events.filter(e => !e.is_bot).map(e => e.user_id))];
  const botIds   = [...new Set(events.filter(e => e.is_bot).map(e => e.user_id))];

  const tsList = events.map(e => e.ts || 0);
  const maxTs = safeMax(tsList, 0);
  const positiveTsList = events.filter(e => (e.ts || 0) > 0).map(e => e.ts);
  const minTs = safeMin(positiveTsList, maxTs);
  const durationMs = maxTs - minTs;

  // ── PER-PLAYER STATS ──────────────────────────────────────────────────────
  const perPlayer = {};
  events.forEach(e => {
    if (!perPlayer[e.user_id]) {
      perPlayer[e.user_id] = {
        user_id: e.user_id, is_bot: e.is_bot,
        kills: 0, deaths: 0, loot: 0, stormDeaths: 0,
        positions: [], firstTs: Infinity, lastTs: 0,
      };
    }
    const p = perPlayer[e.user_id];
    if (e.event === 'Kill' || e.event === 'BotKill') p.kills++;
    if (e.event === 'Killed')        p.deaths++;
    if (e.event === 'Loot')          p.loot++;
    if (e.event === 'KilledByStorm') p.stormDeaths++;
    if (e.event === 'Position')      p.positions.push(e);
    if ((e.ts || 0) < p.firstTs) p.firstTs = e.ts || 0;
    if ((e.ts || 0) > p.lastTs)  p.lastTs  = e.ts || 0;
  });

  const players = Object.values(perPlayer);
  const humanPlayers = players.filter(p => !p.is_bot);

  // ── SURVIVAL ──────────────────────────────────────────────────────────────
  const deadIds = new Set([...deaths.map(e => e.user_id), ...storm.map(e => e.user_id)]);
  const survivors = humanIds.filter(id => !deadIds.has(id)).length;

  // ── DISTANCE TRAVELED ─────────────────────────────────────────────────────
  function dist(pts) {
    let d = 0;
    const s = [...pts].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    for (let i = 1; i < s.length; i++) {
      const dx = (s[i].px || 0) - (s[i - 1].px || 0);
      const dy = (s[i].py || 0) - (s[i - 1].py || 0);
      d += Math.sqrt(dx * dx + dy * dy);
    }
    return Math.round(d);
  }

  const playerStats = humanPlayers.map(p => ({
    user_id: p.user_id,
    kills: p.kills, deaths: p.deaths, loot: p.loot,
    stormDeaths: p.stormDeaths,
    kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills > 0 ? '∞' : '0.00',
    distance: dist(p.positions),
    survivalMs: p.lastTs - p.firstTs,
    alive: !deadIds.has(p.user_id),
  })).sort((a, b) => b.kills - a.kills);

  const avgDist = humanPlayers.length > 0
    ? Math.round(playerStats.reduce((s, p) => s + p.distance, 0) / humanPlayers.length)
    : 0;

  // ── TIMELINE BUCKETS ──────────────────────────────────────────────────────
  const BUCKETS = 6;
  const bucketMs = durationMs / (BUCKETS || 1);
  const timeline = Array.from({ length: BUCKETS }, (_, i) => {
    const s = minTs + i * bucketMs;
    const e = s + bucketMs;
    const m1 = Math.floor((i * bucketMs) / 60000);
    const m2 = Math.floor(((i + 1) * bucketMs) / 60000);
    return {
      label: `${m1}–${m2}m`,
      kills:  kills.filter(ev => ev.ts >= s && ev.ts < e).length,
      deaths: deaths.filter(ev => ev.ts >= s && ev.ts < e).length,
      storm:  storm.filter(ev => ev.ts >= s && ev.ts < e).length,
      loot:   loot.filter(ev => ev.ts >= s && ev.ts < e).length,
    };
  });

  // ── MAP QUADRANT KILLS ────────────────────────────────────────────────────
  const quadrants = { NW: 0, NE: 0, SW: 0, SE: 0 };
  kills.filter(e => !e.is_bot).forEach(e => {
    const px = e.px || 0, py = e.py || 0;
    if (px < 512 && py < 512)  quadrants.NW++;
    else if (px >= 512 && py < 512)  quadrants.NE++;
    else if (px < 512 && py >= 512)  quadrants.SW++;
    else                             quadrants.SE++;
  });

  // ── STORM PHASES ──────────────────────────────────────────────────────────
  const stormPhases = {
    early: storm.filter(e => (e.ts || 0) < minTs + durationMs * 0.33).length,
    mid:   storm.filter(e => (e.ts || 0) >= minTs + durationMs * 0.33 && (e.ts || 0) < minTs + durationMs * 0.66).length,
    late:  storm.filter(e => (e.ts || 0) >= minTs + durationMs * 0.66).length,
  };

  // ── GRID DENSITY (kill density per map cell) ──────────────────────────────
  const CELL = 128;
  const killGrid = Array.from({ length: 8 }, () => Array(8).fill(0));
  kills.filter(e => !e.is_bot).forEach(e => {
    const cx = Math.min(7, Math.max(0, Math.floor((e.px || 0) / CELL)));
    const cy = Math.min(7, Math.max(0, Math.floor((e.py || 0) / CELL)));
    killGrid[cy][cx]++;
  });

  // ── CHOKE POINT DETECTION (mean + 2σ) ────────────────────────────────────
  const flatKillCells = killGrid.flat().filter(v => v > 0);
  const killMean = flatKillCells.length > 0
    ? flatKillCells.reduce((a, b) => a + b, 0) / flatKillCells.length : 0;
  const killVariance = flatKillCells.length > 0
    ? flatKillCells.reduce((a, b) => a + (b - killMean) ** 2, 0) / flatKillCells.length : 0;
  const killStdDev = Math.sqrt(killVariance);
  const chokeThreshold = killMean + 2 * killStdDev;

  const chokeFlags = killGrid.map(row => row.map(val => val > chokeThreshold && val > 0));

  const chokePoints = [];
  const humanKillTotal = kills.filter(e => !e.is_bot).length;
  for (let cy = 0; cy < 8; cy++) {
    for (let cx = 0; cx < 8; cx++) {
      if (chokeFlags[cy][cx]) {
        chokePoints.push({
          cx, cy,
          kills: killGrid[cy][cx],
          pct: humanKillTotal > 0 ? killGrid[cy][cx] / humanKillTotal * 100 : 0,
          area: `${cy < 4 ? 'North' : 'South'}-${cx < 4 ? 'West' : 'East'}`,
        });
      }
    }
  }
  chokePoints.sort((a, b) => b.kills - a.kills);

  // ── LOOT HOTSPOTS ─────────────────────────────────────────────────────────
  const lootGrid = Array.from({ length: 8 }, () => Array(8).fill(0));
  loot.forEach(e => {
    const cx = Math.min(7, Math.max(0, Math.floor((e.px || 0) / CELL)));
    const cy = Math.min(7, Math.max(0, Math.floor((e.py || 0) / CELL)));
    lootGrid[cy][cx]++;
  });

  // ── MATCH COUNT ───────────────────────────────────────────────────────────
  const matchIds = [...new Set(events.map(e => e.match_id).filter(Boolean))];
  const matchCount = matchIds.length;
  const killsPerMatch = matchCount > 0 ? (kills.length / matchCount).toFixed(1) : kills.length;

  // ── TIME TO FIRST ENGAGEMENT ──────────────────────────────────────────────
  const matchFirstKills = {};
  kills.forEach(e => {
    const mid = e.match_id;
    if (!matchFirstKills[mid] || (e.ts || 0) < matchFirstKills[mid]) {
      matchFirstKills[mid] = e.ts || 0;
    }
  });
  const firstKillTimes = Object.values(matchFirstKills).filter(t => t > 0);
  const avgFirstKillMs = firstKillTimes.length > 0
    ? firstKillTimes.reduce((a, b) => a + b, 0) / firstKillTimes.length : 0;
  const avgFirstKillLabel = avgFirstKillMs > 0
    ? `T+${Math.floor(avgFirstKillMs / 60000)}:${String(Math.floor((avgFirstKillMs % 60000) / 1000)).padStart(2, '0')}`
    : 'N/A';
  const firstKillAssessment =
    avgFirstKillMs > 0 && avgFirstKillMs < 60000   ? 'Too fast — loot density may be too low or spawns too close' :
    avgFirstKillMs > 0 && avgFirstKillMs < 180000  ? 'Healthy — players loot before first contact' :
    avgFirstKillMs > 0 && avgFirstKillMs < 360000  ? 'Moderate — map may be large or loot dispersed' :
    avgFirstKillMs > 0                              ? 'Very slow — check if players are engaging at all' : 'No data';

  // ── ENGAGEMENT DISTANCE (attacker-to-victim at moment of kill) ─────────────
  const engagementDistances = [];
  kills.forEach(k => {
    const matchedDeath = deaths.find(d =>
      d.match_id === k.match_id &&
      d.user_id !== k.user_id &&
      Math.abs((d.ts || 0) - (k.ts || 0)) < 500 &&
      d.px != null && k.px != null
    );
    if (matchedDeath) {
      const dx = (matchedDeath.px || 0) - (k.px || 0);
      const dy = (matchedDeath.py || 0) - (k.py || 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0 && dist < 1200) engagementDistances.push(dist);
    }
  });
  const avgEngagementDist = engagementDistances.length > 0
    ? Math.round(engagementDistances.reduce((a, b) => a + b, 0) / engagementDistances.length) : 0;
  const engagementStyle =
    avgEngagementDist > 0 && avgEngagementDist < 50   ? 'Close-quarters — map is choke-heavy. Cover variety needed.' :
    avgEngagementDist > 0 && avgEngagementDist < 120  ? 'Mid-range — balanced engagement distances. Healthy.' :
    avgEngagementDist > 0 && avgEngagementDist < 250  ? 'Long-range — map favors sniping. Review cover placement.' :
    avgEngagementDist > 0                             ? 'Very long-range — open map. Verify this is intended.' :
    'Insufficient paired events';

  return {
    summary: {
      humanPlayers: humanIds.length,
      botPlayers: botIds.length,
      totalKills: kills.length,
      humanKills: kills.filter(e => !e.is_bot).length,
      totalDeaths: deaths.length + storm.length,
      stormDeaths: storm.length,
      stormDeathRate: (deaths.length + storm.length) > 0
        ? Math.round(storm.length / (deaths.length + storm.length) * 100)
        : 0,
      totalLoot: loot.length,
      lootPerPlayer: humanIds.length > 0 ? (loot.length / humanIds.length).toFixed(1) : 0,
      survivalRate: humanIds.length > 0 ? Math.round(survivors / humanIds.length * 100) : 0,
      survivors,
      durationMs,
      durationLabel: `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`,
      kd: deaths.length > 0 ? (kills.length / deaths.length).toFixed(2) : kills.length > 0 ? '∞' : '0.00',
      avgDistance: avgDist,
      matchCount,
      killsPerMatch,
      totalEvents: events.length,
      avgFirstKillLabel, avgFirstKillMs, firstKillAssessment,
      avgEngagementDist, engagementStyle, engagementSampleSize: engagementDistances.length,
    },
    playerStats,
    timeline,
    quadrants,
    stormPhases,
    killGrid, chokeFlags, chokePoints,
    killGridStats: { mean: Math.round(killMean), stdDev: Math.round(killStdDev), threshold: Math.round(chokeThreshold) },
    lootGrid,
    botVsHuman: {
      humanKills: kills.filter(e => !e.is_bot).length,
      botKills:   kills.filter(e => e.is_bot).length,
      humanStorm: storm.filter(e => !e.is_bot).length,
      botStorm:   storm.filter(e => e.is_bot).length,
      humanLoot:  humanIds.length > 0 ? (loot.filter(e => !e.is_bot).length / humanIds.length).toFixed(1) : 0,
      botLoot:    botIds.length > 0 ? (loot.filter(e => e.is_bot).length / botIds.length).toFixed(1) : 0,
    },
  };
}

export function computeStormCircles(events) {
  if (!events || events.length === 0) return [];

  const positions = events
    .filter(e => e.event === 'Position' && !e.is_bot)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));

  if (positions.length === 0) return [];

  const tsList = events.map(e => e.ts || 0);
  const maxTs = safeMax(tsList, 0);
  const positiveTsList = events.filter(e => (e.ts || 0) > 0).map(e => e.ts);
  const minTs = safeMin(positiveTsList, maxTs);
  const duration = maxTs - minTs;

  if (duration <= 0) return [];

  const SNAPSHOTS = 8;
  const circles = [];

  for (let i = 0; i < SNAPSHOTS; i++) {
    const t = minTs + (duration / SNAPSHOTS) * i;
    const tNext = t + duration / SNAPSHOTS;

    const deadByNow = new Set(
      events
        .filter(e => (e.event === 'Killed' || e.event === 'KilledByStorm') && (e.ts || 0) <= t)
        .map(e => e.user_id)
    );

    const alivePosAtT = positions.filter(e =>
      !deadByNow.has(e.user_id) &&
      Math.abs((e.ts || 0) - t) < duration / SNAPSHOTS
    );

    if (alivePosAtT.length < 3) continue;

    const cx = alivePosAtT.reduce((s, e) => s + (e.px || 0), 0) / alivePosAtT.length;
    const cy = alivePosAtT.reduce((s, e) => s + (e.py || 0), 0) / alivePosAtT.length;

    const progress = i / (SNAPSHOTS - 1);
    const radius = Math.round(480 - progress * 400);

    const nearbyStorm = events.filter(e =>
      e.event === 'KilledByStorm' &&
      (e.ts || 0) >= t - duration / SNAPSHOTS &&
      (e.ts || 0) < tNext
    );

    circles.push({
      ts: t,
      cx: Math.round(cx),
      cy: Math.round(cy),
      radius,
      progress,
      stormDeathsInPhase: nearbyStorm.length,
    });
  }

  return circles;
}

export function getActiveCircle(circles, currentTimeMs, matchMinTs) {
  if (!circles || circles.length === 0) return null;
  const t = currentTimeMs + matchMinTs;
  const past = circles.filter(c => c.ts <= t);
  if (past.length === 0) return circles[0];
  return past[past.length - 1];
}

export function computeLandingZones(events) {
  if (!events || events.length === 0) return [];
  const seen = new Set();
  const landings = [];
  const sorted = [...events]
    .filter(e => e.event === 'Position' && e.px != null && e.py != null)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));

  sorted.forEach(e => {
    const key = `${e.match_id}||${e.user_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      landings.push({
        user_id: e.user_id,
        match_id: e.match_id,
        is_bot: e.is_bot,
        px: e.px,
        py: e.py,
        ts: e.ts,
      });
    }
  });
  return landings;
}

export function computeLandingGrid(landingEvents, humanOnly = true) {
  const GRID = 64;
  const SIZE = 1024;
  let evts = landingEvents;
  if (humanOnly) evts = evts.filter(e => !e.is_bot);
  if (evts.length === 0) return Array.from({ length: GRID }, () => Array(GRID).fill(0));

  const grid = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  evts.forEach(e => {
    const cx = Math.min(GRID - 1, Math.max(0, Math.floor((e.px || 0) / SIZE * GRID)));
    const cy = Math.min(GRID - 1, Math.max(0, Math.floor((e.py || 0) / SIZE * GRID)));
    grid[cy][cx]++;
  });

  // Safe max with reduce instead of spread
  let maxVal = 1;
  for (let ry = 0; ry < GRID; ry++) {
    for (let cx = 0; cx < GRID; cx++) {
      if (grid[ry][cx] > maxVal) maxVal = grid[ry][cx];
    }
  }
  return grid.map(row => row.map(v => v / maxVal));
}

export function getTopLandingZones(landingEvents, humanOnly = true) {
  let evts = landingEvents;
  if (humanOnly) evts = evts.filter(e => !e.is_bot);

  const CELL = 128;
  const zones = {};

  evts.forEach(e => {
    const cx = Math.min(7, Math.max(0, Math.floor((e.px || 0) / 1024 * 8)));
    const cy = Math.min(7, Math.max(0, Math.floor((e.py || 0) / 1024 * 8)));
    const key = `${cx},${cy}`;
    zones[key] = (zones[key] || 0) + 1;
  });

  return Object.entries(zones)
    .map(([key, count]) => {
      const [cx, cy] = key.split(',').map(Number);
      return {
        zone: key, cx, cy, count,
        pct: Math.round(count / (evts.length || 1) * 100),
        px: cx * CELL + CELL / 2,
        py: cy * CELL + CELL / 2,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function computeDeadZones(events, allMatchIds) {
  if (!events || events.length === 0) return [];
  const CELL_SIZE = 128;
  const GRID = 8;
  const totalMatches = allMatchIds?.length || 1;

  const cellTotalEvents = {};
  // matchVisits: cellKey -> Set of match_ids
  const cellMatchIds = {};

  const relevantEvents = events.filter(e =>
    !e.is_bot &&
    e.px != null && e.py != null &&
    ['Position', 'Kill', 'Killed', 'Loot', 'KilledByStorm'].includes(e.event)
  );

  relevantEvents.forEach(e => {
    const cx = Math.min(GRID - 1, Math.max(0, Math.floor((e.px || 0) / 1024 * GRID)));
    const cy = Math.min(GRID - 1, Math.max(0, Math.floor((e.py || 0) / 1024 * GRID)));
    const key = `${cx},${cy}`;

    cellTotalEvents[key] = (cellTotalEvents[key] || 0) + 1;
    if (!cellMatchIds[key]) cellMatchIds[key] = new Set();
    if (e.match_id) cellMatchIds[key].add(e.match_id);
  });

  const allCellValues = Object.values(cellTotalEvents);
  const avgEvents = allCellValues.length > 0
    ? allCellValues.reduce((a, b) => a + b, 0) / allCellValues.length
    : 1;

  const deadZones = [];

  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const key = `${cx},${cy}`;
      const totalEvts = cellTotalEvents[key] || 0;
      const matchVisits = (cellMatchIds[key]?.size) || 0;
      const visitRate = totalMatches > 0 ? matchVisits / totalMatches : 0;

      const isDeadZone = visitRate < 0.2 || (totalEvts < avgEvents * 0.05);
      const isNearDead = visitRate < 0.4 && totalEvts < avgEvents * 0.15;

      if (isDeadZone || isNearDead) {
        const quadX = cx < 4 ? 'West' : 'East';
        const quadY = cy < 4 ? 'North' : 'South';
        const area = `${quadY}-${quadX}`;
        const severity = isDeadZone ? 'dead' : 'underused';

        deadZones.push({
          cx, cy, key, area,
          label: `Zone (${cx},${cy})`,
          totalEvents: totalEvts, matchVisits,
          visitRate: Math.round(visitRate * 100),
          severity,
          px: cx * CELL_SIZE + CELL_SIZE / 2,
          py: cy * CELL_SIZE + CELL_SIZE / 2,
        });
      }
    }
  }

  return deadZones.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'dead' ? -1 : 1;
    return a.visitRate - b.visitRate;
  });
}
