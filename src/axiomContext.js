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

  const discrete = (filteredEvents || []).filter(e => e.event !== 'Position' && e.event !== 'BotPosition');
  const kills   = discrete.filter(e => e.event === 'Kill' || e.event === 'BotKill').length;
  const deaths  = discrete.filter(e => e.event === 'Killed' || e.event === 'BotKilled').length;
  const loot    = discrete.filter(e => e.event === 'Loot').length;
  const storm   = discrete.filter(e => e.event === 'KilledByStorm').length;
  const humans  = [...new Set((filteredEvents||[]).filter(e=>e.player_type==='human').map(e=>e.user_id))].length;
  const bots    = [...new Set((filteredEvents||[]).filter(e=>e.player_type==='bot').map(e=>e.user_id))].length;
  const totalDisc = discrete.length;

  const phasePct = matchDurationMs > 0 ? currentTimeMs / matchDurationMs : 0;
  const phase    = phasePct < 0.33 ? 'early-game' : phasePct < 0.66 ? 'mid-game' : 'late-game';
  const timeStr  = matchDurationMs > 0
    ? `T+${Math.floor(currentTimeMs/60000)}:${String(Math.floor((currentTimeMs%60000)/1000)).padStart(2,'0')}`
    : 'N/A';

  const allDisc = (allEvents||[]).filter(e=>e.event!=='Position' && e.event !== 'BotPosition');
  const totalMatchKilled = allDisc.filter(e=>e.event==='Killed' || e.event === 'BotKilled').length;

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
      kills, deaths, loot, stormDeaths: storm,
      humanPlayers: humans, botPlayers: bots,
      stormDeathRate: (deaths+storm)>0 ? `${((storm/(deaths+storm))*100).toFixed(1)}%` : 'N/A',
      killDeathRatio: deaths>0 ? (kills/deaths).toFixed(2) : 'N/A',
      lootPerPlayer: humans>0 ? (loot/humans).toFixed(1) : 'N/A',
      totalEventsVisible: totalDisc,
    },
    matchContext: {
      totalKillsInFullDataset: totalMatchKilled, // approximations
      matchDurationSeconds: matchDurationMs>0 ? Math.floor(matchDurationMs/1000) : null,
    },
    activeEvent: hoveredEvent ? {
      type: hoveredEvent.event,
      player: hoveredEvent.user_id,
      playerType: hoveredEvent.player_type,
      timeInMatch: hoveredEvent.ts>0 ? `T+${Math.floor(hoveredEvent.ts/60000)}:${String(Math.floor((hoveredEvent.ts%60000)/1000)).padStart(2,'0')}` : 'N/A',
      mapPosition: `pixel (${Math.round(hoveredEvent.px||0)}, ${Math.round(hoveredEvent.py||0)})`,
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
- Always reference actual numbers from the data snapshot above when available
- When answering spatial questions (where is X happening), describe it in terms of map zones, proportions, and timing — you cannot see pixel coordinates directly but you can reason from the data
- If the data source is an uploaded file, adapt your analysis accordingly and acknowledge the custom data
- Never say "I don't have access to" — you DO have the context above. Work with it.
- If a question needs more data than is visible (e.g. specific coordinate clusters), tell the designer exactly which tool controls to use to find it
- Keep responses under 120 words unless the designer asks for a detailed breakdown
- End every unsolicited insight with one concrete actionable recommendation
- Use game design terminology: choke points, dead zones, rotation paths, engagement range, safe zone pressure, loot density, extraction routes`;
}

export function enrichPrompt(userQuestion, context) {
  const q = userQuestion.toLowerCase();

  if (q.includes('most kill') || q.includes('kill hotspot') || q.includes('where kill')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Focus on kill concentration. The data shows ${context.visibleData.kills} kill events visible. Reason about where on ${context.currentView.map} kills tend to cluster based on typical extraction shooter geometry (bridges, corridors, building entrances, storm boundary edges). Reference the kill/death ratio of ${context.visibleData.killDeathRatio}. Tell the designer to enable the Kill Heatmap in aggregate view to see the exact spatial distribution.`;
  }

  if (q.includes('bot') || q.includes('human') || q.includes('difference') || q.includes('vs')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: The visible data shows ${context.visibleData.humanPlayers} human players and ${context.visibleData.botPlayers} bots. Compare their behavioral differences in extraction shooters. Tell the designer to use the Player Segment toggle to switch between ALL / HUMAN / BOT and compare the Movement Heatmap between the two. Explain why bot paths tend to follow map edges and scripted routes vs human organic decision-making.`;
  }

  if (q.includes('storm') || q.includes('dying to storm') || q.includes('storm death')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Storm deaths are ${context.visibleData.stormDeaths} out of total deaths, a ${context.visibleData.stormDeathRate} storm death rate. In extraction shooters, storm deaths cluster near loot-rich areas adjacent to the storm boundary — players over-commit to looting and can't rotate in time. Tell the designer to enable the KilledByStorm event filter (yellow markers) and use timeline playback at the late-game phase to see where the clusters form.`;
  }

  if (q.includes('dead zone') || q.includes('ignored') || q.includes('nobody') || q.includes('empty')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Dead zones are areas with near-zero movement density. Tell the designer to switch to the Movement Heatmap in aggregate view with Human filter active, then look for cold (dark) areas that cover significant portions of the map. Cross-reference with the Loot heatmap — if loot events are also absent, players are not entering the zone at all vs just passing through quickly.`;
  }

  if (q.includes('upload') || q.includes('my data') || q.includes('my file') || q.includes('custom')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: The designer is asking about uploaded/custom data. Data source: ${context.dataSource}. ${context.currentView.map !== 'No map' ? `Their data is on map: ${context.currentView.map}.` : 'No map loaded yet.'} Visible events: ${context.visibleData.totalEventsVisible}. Guide them on using the Upload Data tab if they haven't uploaded yet, or analyze their current uploaded data if they have. Acknowledge this is their own game data, not the built-in LILA BLACK dataset.`;
  }

  if (q.includes('fix') || q.includes('improve') || q.includes('recommend') || q.includes('what should')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Give a prioritized design recommendation based on the current data snapshot. Storm death rate: ${context.visibleData.stormDeathRate}. K/D ratio: ${context.visibleData.killDeathRatio}. Players visible: ${context.visibleData.humanPlayers} humans. Be specific about what to change and what metric to watch after the change. Frame it as: issue → root cause → fix → success metric.`;
  }

  if (q.includes('loot') || q.includes('item') || q.includes('pickup')) {
    return `${userQuestion}

ANALYSIS INSTRUCTION: Loot events visible: ${context.visibleData.loot}. Loot per player: ${context.visibleData.lootPerPlayer}. In extraction shooters, loot distribution drives player routing — players go where loot is. If loot density is concentrated in one area, it creates forced engagement funnels. Tell the designer to enable the Loot event filter (green markers) and compare loot density against the Kill heatmap to see if high-loot zones are also high-kill zones.`;
  }

  return userQuestion;
}

export const AI_TRIGGERS = {
  EVENT_HOVER: (payload, context) => `A ${payload?.event} event just occurred at map position (${Math.round(payload?.px||0)}, ${Math.round(payload?.py||0)}) at ${payload?.ts ? 'T+'+Math.floor(payload.ts/60000)+':'+String(Math.floor((payload.ts%60000)/1000)).padStart(2,'0') : 'unknown time'}. Player: ${payload?.user_id} (${payload?.player_type}). What does this event tell us about this area of the map?`,
  HEATMAP_CHANGE: (payload, context) => `The designer just switched to ${payload} heatmap. Based on the current data snapshot, what patterns should they look for and what would be a concerning vs healthy result for this metric?`,
  MATCH_SELECTED: (payload, context) => `Match ${payload} was just loaded. Give a quick tactical briefing based on the data snapshot. What stands out? What should the designer investigate first?`,
  PLAYER_ISOLATED: (payload, context) => `The designer isolated player ${payload}'s path. What should they look for in this individual player's movement to assess map health?`,
  TIMELINE_PHASE: (payload, context) => `The match just entered the ${payload} phase. What map design issues typically reveal themselves at this stage that the designer should watch for?`,
  USER_QUESTION: (payload, context) => payload,
};
