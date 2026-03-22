import { computeStats } from './statsEngine';

export function getAIContext(appState) {
  const {
    selectedMap, selectedDate, selectedMatchId,
    playerTypeFilter, activeEvents,
    showHeatmap, heatmapMode,
    currentTimeMs, matchDurationMs,
    filteredEvents, allEvents,
    hoveredEvent, isolatedPlayer,
    isUploadedData, uploadedMapName,
  } = appState;

  const events = filteredEvents || [];
  const all    = allEvents || [];

  const discrete = events.filter(e => e.event !== 'Position' && e.event !== 'BotPosition');
  const kills    = discrete.filter(e => e.event === 'Kill' || e.event === 'BotKill').length;
  const humanKills = discrete.filter(e => (e.event === 'Kill') && !e.is_bot).length;
  const deaths   = discrete.filter(e => e.event === 'Killed').length;
  const loot     = discrete.filter(e => e.event === 'Loot').length;
  const storm    = discrete.filter(e => e.event === 'KilledByStorm').length;
  const humans   = [...new Set(events.filter(e => e.player_type === 'human').map(e => e.user_id))].length;
  const bots     = [...new Set(events.filter(e => e.player_type === 'bot').map(e => e.user_id))].length;

  const phasePct = matchDurationMs > 0 ? currentTimeMs / matchDurationMs : 0;
  const phase    = phasePct < 0.33 ? 'early-game' : phasePct < 0.66 ? 'mid-game' : 'late-game';
  const timeStr  = matchDurationMs > 0
    ? `T+${Math.floor(currentTimeMs / 60000)}:${String(Math.floor((currentTimeMs % 60000) / 1000)).padStart(2, '0')}`
    : 'N/A';

  // Compute rich stats for the AI to use
  let richStats = null;
  try {
    richStats = events.length > 0 ? computeStats(events) : null;
  } catch (e) {
    // don't crash the panel if stats fail
  }

  // Build kill zone description from the grid
  let killZoneSummary = 'No kill data';
  if (richStats?.killGrid) {
    const flat = richStats.killGrid.flat();
    const total = flat.reduce((a, b) => a + b, 0);
    let maxV = 0, maxIdx = 0;
    flat.forEach((v, i) => { if (v > maxV) { maxV = v; maxIdx = i; } });
    const hotRow = Math.floor(maxIdx / 8), hotCol = maxIdx % 8;
    const quadX = hotCol < 4 ? 'West' : 'East';
    const quadY = hotRow < 4 ? 'North' : 'South';
    const pct = total > 0 ? Math.round(maxV / total * 100) : 0;
    killZoneSummary = `Hottest zone: ${quadY}-${quadX} area (cell ${hotCol},${hotRow}) with ${maxV} kills (${pct}% of all kills)`;
  }

  // Storm phase summary
  let stormSummary = 'No storm data';
  if (richStats?.stormPhases) {
    const sp = richStats.stormPhases;
    const total = sp.early + sp.mid + sp.late;
    const dominant = sp.late > sp.early && sp.late > sp.mid ? 'late-game'
      : sp.mid > sp.early ? 'mid-game' : 'early-game';
    stormSummary = `Storm deaths by phase — early:${sp.early} mid:${sp.mid} late:${sp.late} (total:${total}, dominant:${dominant})`;
  }

  // Top players
  let topPlayersSummary = 'No player data';
  if (richStats?.playerStats && richStats.playerStats.length > 0) {
    topPlayersSummary = richStats.playerStats.slice(0, 3).map((p, i) =>
      `#${i + 1} ${p.user_id.slice(-8)}: ${p.kills}K/${p.deaths}D (K/D:${p.kd}) dist:${p.distance}px`
    ).join(' | ');
  }

  return {
    dataSource: isUploadedData ? `Uploaded file — map: ${uploadedMapName || 'Unknown'}` : 'LILA BLACK built-in dataset',
    currentView: {
      map: isUploadedData ? (uploadedMapName || 'Uploaded Map') : selectedMap,
      date: selectedDate || 'All dates',
      match: selectedMatchId || 'Full Day Aggregate',
      playerFilter: playerTypeFilter,
      activeEventTypes: activeEvents,
      heatmapActive: showHeatmap,
      heatmapMode: showHeatmap ? heatmapMode : 'off',
      timelinePosition: timeStr,
      matchPhase: selectedMatchId ? phase : 'N/A',
    },
    visibleData: {
      kills, humanKills, deaths, loot, stormDeaths: storm,
      humanPlayers: humans, botPlayers: bots,
      totalEvents: events.length,
      stormDeathRate: (deaths + storm) > 0 ? `${((storm / (deaths + storm)) * 100).toFixed(1)}%` : 'N/A',
      killDeathRatio: deaths > 0 ? (kills / deaths).toFixed(2) : 'N/A',
      survivalRate: richStats?.summary?.survivalRate != null ? `${richStats.summary.survivalRate}%` : 'N/A',
      lootPerPlayer: humans > 0 ? (loot / humans).toFixed(1) : 'N/A',
      avgDistancePx: richStats?.summary?.avgDistance ?? 'N/A',
      matchDuration: richStats?.summary?.durationLabel ?? 'N/A',
      matchCount: richStats?.summary?.matchCount ?? 1,
    },
    spatialInsights: {
      killZoneHotspot: killZoneSummary,
      stormPhaseBreakdown: stormSummary,
      quadrantDistribution: richStats?.quadrants
        ? `NW:${richStats.quadrants.NW} NE:${richStats.quadrants.NE} SW:${richStats.quadrants.SW} SE:${richStats.quadrants.SE}`
        : 'N/A',
      topHumanPlayers: topPlayersSummary,
    },
    activeEvent: hoveredEvent ? {
      type: hoveredEvent.event,
      player: hoveredEvent.user_id,
      playerType: hoveredEvent.player_type,
      timeInMatch: hoveredEvent.ts > 0
        ? `T+${Math.floor(hoveredEvent.ts / 60000)}:${String(Math.floor((hoveredEvent.ts % 60000) / 1000)).padStart(2, '0')}`
        : 'N/A',
      mapPosition: `pixel (${Math.round(hoveredEvent.px || 0)}, ${Math.round(hoveredEvent.py || 0)})`,
    } : null,
    focusedPlayer: isolatedPlayer || null,
  };
}

export function buildSystemPrompt(context) {
  return `You are AXIOM, LILA Games' embedded design intelligence AI. You are integrated directly into the LILA BLACK Player Journey Visualization Tool — a browser-based telemetry map tool used by Level Designers.

Your role: analyze spatial gameplay patterns and give sharp, actionable design recommendations. You speak like a tactical analyst, not a generic assistant. Direct. Specific. No fluff.

CURRENT TOOL STATE (what the designer is looking at right now):
${JSON.stringify(context, null, 2)}

IMPORTANT RULES:
- USE THE ACTUAL NUMBERS from the data snapshot above. Never say you "don't have enough data" if there are numbers in the snapshot.
- The spatialInsights section gives you pre-computed spatial breakdown. Use it to answer spatial questions directly.
- When answering spatial questions (where is X happening), use the quadrantDistribution and killZoneHotspot from spatialInsights.
- Never say "I don't have access to" — you DO have the context above. Work with it.
- If a question needs more data than is visible (e.g. specific coordinate clusters), tell the designer exactly which tool controls to use to find it.
- Keep responses under 150 words unless the designer asks for a detailed breakdown.
- End every unsolicited insight with one concrete actionable recommendation.
- Use game design terminology: choke points, dead zones, rotation paths, engagement range, safe zone pressure, loot density, extraction routes.
- When the designer selects a specific match or player filter, tailor answers ONLY to that selection, not generic advice.`;
}

export function enrichPrompt(userQuestion, context) {
  const q = userQuestion.toLowerCase();

  if (q.includes('most kill') || q.includes('kill hotspot') || q.includes('where kill') || q.includes('kill zone')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Use spatialInsights.killZoneHotspot (${context.spatialInsights?.killZoneHotspot}) and spatialInsights.quadrantDistribution (${context.spatialInsights?.quadrantDistribution}) to give a specific spatial answer. Total kills visible: ${context.visibleData.kills} (${context.visibleData.humanKills} human kills). Tell the designer to enable Kill Heatmap in aggregate view to see the exact spatial distribution.`;
  }

  if (q.includes('bot') || q.includes('human') || q.includes('difference') || q.includes('vs')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Visible data — ${context.visibleData.humanPlayers} human players and ${context.visibleData.botPlayers} bots. Human K/D: ${context.visibleData.killDeathRatio}. Use the Player Segment toggle to compare Movement Heatmap between ALL/HUMAN/BOT. Explain why bot paths tend to follow map edges and scripted routes vs human organic decision-making.`;
  }

  if (q.includes('storm') || q.includes('dying to storm') || q.includes('storm death')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Storm deaths: ${context.visibleData.stormDeaths} — ${context.visibleData.stormDeathRate} of all deaths. Phase breakdown: ${context.spatialInsights?.stormPhaseBreakdown}. In extraction shooters, storm deaths cluster near loot-rich areas adjacent to the storm boundary. Tell the designer to enable KilledByStorm event filter and use timeline playback at late-game phase.`;
  }

  if (q.includes('dead zone') || q.includes('ignored') || q.includes('nobody') || q.includes('empty')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Use the Statistics tab → Dead Zone Report for a full grid-based breakdown of ignored zones. On the map, switch to Movement Heatmap in aggregate view with Human filter. If loot events are also absent in the same area, players are completely avoiding that region — not just passing through.`;
  }

  if (q.includes('fix') || q.includes('improve') || q.includes('recommend') || q.includes('what should')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Use all available data to prioritize. Storm death rate: ${context.visibleData.stormDeathRate}. K/D: ${context.visibleData.killDeathRatio}. Survival rate: ${context.visibleData.survivalRate}. Kill hotspot: ${context.spatialInsights?.killZoneHotspot}. Frame recommendations as: issue → root cause → fix → success metric.`;
  }

  if (q.includes('survival') || q.includes('survive') || q.includes('who lives')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Survival rate is ${context.visibleData.survivalRate}. Top players: ${context.spatialInsights?.topHumanPlayers}. Storm death rate: ${context.visibleData.stormDeathRate}. Focus on rotation timing and safe zone proximity.`;
  }

  if (q.includes('loot') || q.includes('item') || q.includes('pickup')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Loot events: ${context.visibleData.loot}. Loot per player: ${context.visibleData.lootPerPlayer}. Check if high-loot zones overlap with killzone hotspot (${context.spatialInsights?.killZoneHotspot}). If yes, loot is creating forced fights — redistribute loot to flatten distribution.`;
  }

  if (q.includes('player') || q.includes('top') || q.includes('leaderboard') || q.includes('best')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Top players in current view: ${context.spatialInsights?.topHumanPlayers}. Avg distance traveled: ${context.visibleData.avgDistancePx}px. Use the Statistics tab for the full leaderboard. Isolate a player in the filter panel to track their individual path.`;
  }

  return userQuestion;
}

export const AI_TRIGGERS = {
  EVENT_HOVER: (payload, context) =>
    `A ${payload?.event} event just occurred at map position (${Math.round(payload?.px || 0)}, ${Math.round(payload?.py || 0)}) at ${payload?.ts ? 'T+' + Math.floor(payload.ts / 60000) + ':' + String(Math.floor((payload.ts % 60000) / 1000)).padStart(2, '0') : 'unknown time'}. Player: ${payload?.user_id} (${payload?.player_type}). What does this event tell us about this area of the map?`,
  HEATMAP_CHANGE: (payload, context) =>
    `The designer just switched to ${payload} heatmap. Current kill hotspot: ${context.spatialInsights?.killZoneHotspot}. K/D: ${context.visibleData?.killDeathRatio}. What patterns should they look for and what would be a concerning vs healthy result for this metric?`,
  MATCH_SELECTED: (payload, context) =>
    `Match ${payload} was just loaded. Data snapshot — kills:${context.visibleData?.kills}, storm deaths:${context.visibleData?.stormDeaths}, storm rate:${context.visibleData?.stormDeathRate}, K/D:${context.visibleData?.killDeathRatio}, survival:${context.visibleData?.survivalRate}. Kill hotspot: ${context.spatialInsights?.killZoneHotspot}. Give a quick tactical briefing. What stands out? What should the designer investigate first?`,
  PLAYER_ISOLATED: (payload, context) =>
    `The designer isolated player ${payload}'s path. What should they look for in this individual player's movement to assess map health? Consider rotation efficiency, choke point usage, and whether their death location (if killed) reveals a map design issue.`,
  TIMELINE_PHASE: (payload, context) =>
    `The match just entered the ${payload} phase. Storm phase breakdown: ${context.spatialInsights?.stormPhaseBreakdown}. What map design issues typically reveal themselves at this stage?`,
  USER_QUESTION: (payload, context) => payload,
};
