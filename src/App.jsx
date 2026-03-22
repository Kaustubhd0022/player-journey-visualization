import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { loadEvents, loadHeatmaps, loadIndex } from './dataLoader';

function runDataDiagnostic(rawEvents, filteredEvents, selectedMap, selectedDate, selectedMatchId) {
  console.group('=== LILA DATA DIAGNOSTIC ===');
  
  console.log('RAW EVENTS LOADED:', rawEvents?.length ?? 'undefined/null');
  
  if (!rawEvents || rawEvents.length === 0) {
    console.error('CRITICAL: No raw events loaded at all. JSON fetch failed or file is empty.');
    console.groupEnd();
    return;
  }
  
  // Check event types
  const eventTypes = {};
  rawEvents.forEach(e => {
    eventTypes[e.event] = (eventTypes[e.event] || 0) + 1;
  });
  console.log('EVENT TYPE BREAKDOWN:', eventTypes);
  
  // Check player types
  const humanCount = rawEvents.filter(e => e.player_type === 'human').length;
  const botCount   = rawEvents.filter(e => e.player_type === 'bot').length;
  const unknownType = rawEvents.filter(e => !e.player_type).length;
  console.log('PLAYER TYPES:', { human: humanCount, bot: botCount, unknown: unknownType });
  
  if (unknownType > 0) {
    console.warn('WARNING: Some events have no player_type — bot detection may have failed');
    console.log('Sample unknown event:', rawEvents.find(e => !e.player_type));
  }
  
  // Check coordinates
  const withPixels  = rawEvents.filter(e => e.px != null && e.py != null);
  const missingPx   = rawEvents.filter(e => e.px == null || e.py == null);
  const outOfBounds = rawEvents.filter(e => e.px < 0 || e.px > 1024 || e.py < 0 || e.py > 1024);
  console.log('COORDINATE STATUS:', {
    totalWithPixels: withPixels.length,
    missingCoords: missingPx.length,
    outOfBounds: outOfBounds.length,
    pctMissing: ((missingPx.length / rawEvents.length) * 100).toFixed(1) + '%',
    pctOutOfBounds: ((outOfBounds.length / rawEvents.length) * 100).toFixed(1) + '%',
  });
  
  if (missingPx.length > 0) {
    console.warn('Sample event with missing coords:', missingPx[0]);
    console.warn('All fields on this event:', Object.keys(missingPx[0]));
  }
  
  // Check timestamp
  const withTs    = rawEvents.filter(e => e.ts != null && e.ts >= 0);
  const missingTs = rawEvents.filter(e => e.ts == null || e.ts < 0);
  const maxTs     = Math.max(...rawEvents.map(e => e.ts || 0));
  const minTs     = Math.min(...rawEvents.filter(e => e.ts > 0).map(e => e.ts));
  console.log('TIMESTAMP STATUS:', {
    withTimestamp: withTs.length,
    missingTimestamp: missingTs.length,
    minTs, maxTs,
    estimatedDurationMinutes: ((maxTs - minTs) / 60000).toFixed(1),
    looksLikeUnixEpoch: maxTs > 1_000_000_000_000 ? 'YES — timestamps may be Unix epoch, not match-relative!' : 'No',
  });
  
  // Check match IDs
  const matchIds = [...new Set(rawEvents.map(e => e.match_id).filter(Boolean))];
  console.log('MATCH IDs FOUND:', matchIds.length, matchIds.slice(0, 5));
  
  // Check map field
  const maps = [...new Set(rawEvents.map(e => e.map || e.map_name).filter(Boolean))];
  console.log('MAPS IN DATA:', maps);
  
  // Check filter losses
  console.log('AFTER ALL FILTERS:', filteredEvents?.length ?? 'undefined');
  console.log('FILTER SETTINGS:', { selectedMap, selectedDate, selectedMatchId });
  
  if (filteredEvents && rawEvents.length > 0) {
    const filterLoss = ((1 - filteredEvents.length / rawEvents.length) * 100).toFixed(1);
    console.log(`FILTER LOSS: ${filterLoss}% of events filtered out`);
    if (filterLoss > 80) {
      console.error('CRITICAL: Filters are removing >80% of events. Check match_id, map name, and date matching logic.');
    }
  }
  
  // Check position events vs discrete events
  const positionEvents = rawEvents.filter(e => e.event === 'Position');
  const discreteEvents = rawEvents.filter(e => e.event !== 'Position');
  console.log('POSITION EVENTS (paths):', positionEvents.length);
  console.log('DISCRETE EVENTS (markers):', discreteEvents.length);
  
  if (positionEvents.length === 0) {
    console.error('NO POSITION EVENTS — paths will not render at all');
  }
  if (discreteEvents.filter(e => e.event === 'Kill').length === 0) {
    console.error('NO KILL EVENTS — check event string decoding. Expected "Kill", got:', [...new Set(discreteEvents.map(e => e.event))]);
  }
  
  // Check sample events
  console.log('SAMPLE RAW EVENT:', rawEvents[0]);
  console.log('SAMPLE KILL EVENT:', rawEvents.find(e => e.event === 'Kill'));
  console.log('SAMPLE POSITION EVENT:', rawEvents.find(e => e.event === 'Position'));
  
  console.groupEnd();
}
import FilterPanel from './FilterPanel';
import MapView from './MapView';
import Timeline from './Timeline';
import UploadMode from './UploadMode';
import CoordConfigScreen from './CoordConfigScreen';
import AxiomPanel from './AxiomPanel';
import AxiomLogo from './AxiomLogo';
import StatsDashboard from './StatsDashboard';
import { computeStats, computeStormCircles, getActiveCircle, computeLandingZones, computeLandingGrid, getTopLandingZones, computeDeadZones } from './statsEngine';
import './styles/globals.css';

export default function App() {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedMap,      setSelectedMap]      = useState('AmbroseValley');
  const [selectedDate,     setSelectedDate]      = useState(null);
  const [selectedMatchId,  setSelectedMatchId]   = useState(null);
  const [playerTypeFilter, setPlayerTypeFilter]  = useState('human'); // 'all'|'human'|'bot'
  const [focusedPlayerId,  setFocusedPlayerId]   = useState(null);
  const [analysisDepth,    setAnalysisDepth]     = useState(1); // 1: Aggregate, 2: Match, 3: Player
  const [activeEvents,     setActiveEvents]       = useState(['Kill', 'BotKill', 'Killed', 'BotKilled', 'Loot', 'KilledByStorm']);

  // ── Layer state ───────────────────────────────────────────────────────────
  const [showPaths, setShowPaths] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showMapImage, setShowMapImage] = useState(true);
  const [heatmapMode,  setHeatmapMode]  = useState('kill'); // 'kill'|'death'|'movement'
  const [hotspotCount, setHotspotCount] = useState(0); // 0 = off, >0 = # of zones

  // ── Timeline state ────────────────────────────────────────────────────────
  const [currentTimeMs,   setCurrentTimeMs]   = useState(0);
  const [isPlaying,       setIsPlaying]        = useState(false);
  const [playbackSpeed,   setPlaybackSpeed]    = useState(1);
  const [matchDurationMs, setMatchDurationMs]  = useState(0);

  // ── AI State ──────────────────────────────────────────────────────────────
  const [axiomOpen, setAxiomOpen]     = useState(false);
  const [isAxiomEnabled, setIsAxiomEnabled] = useState(true);
  const axiomRef = useRef(null);
  const [hoveredEvent, setHoveredEvent] = useState(null);

  // ── New Stats & Dashboard state ───────────────────────────────────────────
  const [activeView, setActiveView] = useState('map'); // 'map' | 'stats'
  
  const [stats, setStats] = useState(null);
  const [landingZones, setLandingZones] = useState([]);
  const [landingGrid, setLandingGrid] = useState(null);
  const [topLandingZones, setTopLandingZones] = useState([]);
  const [deadZones, setDeadZones] = useState([]);
  
  const [showStormCircle, setShowStormCircle] = useState(false);
  const [showLandingZones, setShowLandingZones] = useState(false);
  const [stormCircles, setStormCircles] = useState([]);
  const [activeCircle, setActiveCircle] = useState(null);

  // ── Data state ────────────────────────────────────────────────────────────
  const [index,          setIndex]          = useState({});
  const [allEvents,      setAllEvents]      = useState([]);
  const [heatmapGrids,   setHeatmapGrids]   = useState({});
  const [availableDates, setAvailableDates]  = useState([]);
  const [availableMatches, setAvailableMatches] = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [viewMode,       setViewMode]       = useState('built-in'); // 'built-in' | 'upload'
  const [uploadedData,   setUploadedData]   = useState(null); // { events, heatmaps, matches, dates, mapConfigs }
  const [needsConfig,    setNeedsConfig]    = useState(null); // { mapName }

  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);

  // ── Load index on mount ───────────────────────────────────────────────────
  useEffect(() => {
    loadIndex().then(idx => {
      setIndex(idx);
      const dates = [...new Set(
        Object.values(idx).filter(d => d.map === 'AmbroseValley').map(d => d.date)
      )].sort();
      setAvailableDates(dates);
      if (dates.length > 0) setSelectedDate(dates[dates.length - 1]);
    });
  }, []);

  // ── Load data when map or date changes ───────────────────────────────────
  useEffect(() => {
    if (!selectedMap || !selectedDate) return;
    setLoading(true);
    setSelectedMatchId(null);
    setFocusedPlayerId(null);
    setCurrentTimeMs(0);
    setIsPlaying(false);

    const key = `${selectedMap}_${selectedDate}`;
    const meta = index[key];
    if (!meta) { 
      setAllEvents([]);
      setHeatmapGrids({});
      setAvailableMatches([]);
      setLoading(false); 
      return; 
    }

    setAvailableMatches(meta.matches || []);

    Promise.all([
      loadEvents(meta.eventFile),
      loadHeatmaps(meta.heatmapFile),
    ]).then(([eventsData, heatmapData]) => {
      setAllEvents(eventsData.events || []);
      runDataDiagnostic(eventsData.events || [], eventsData.events || [], selectedMap, selectedDate, null);
      setHeatmapGrids(heatmapData || {});
      setLoading(false);
    }).catch(err => {
      console.error('Data load failed:', err);
      setLoading(false);
    });
  }, [selectedMap, selectedDate, index]);

  // ── Update available dates when map changes ───────────────────────────────
  useEffect(() => {
    const dates = [...new Set(
      Object.values(index).filter(d => d.map === selectedMap).map(d => d.date)
    )].sort();
    setAvailableDates(dates);
    if (!dates.includes(selectedDate)) {
        setSelectedDate(dates[dates.length - 1] || null);
    }
  }, [selectedMap, index, selectedDate]);

  // ── Compute source events ───────────────────────────────────────────────
  const sourceEvents = (viewMode === 'upload' && uploadedData) 
    ? uploadedData.events.filter(e => e.map === selectedMap) 
    : allEvents;

  // ── Match duration tracking ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedMatchId) {
      setMatchDurationMs(0);
      setFocusedPlayerId(null);
      setCurrentTimeMs(0);
      return;
    }
    const matchEvents = sourceEvents.filter(e => e.match_id === selectedMatchId);
    const maxTs = Math.max(...matchEvents.map(e => e.ts), 0);
    setMatchDurationMs(maxTs);
    setCurrentTimeMs(0);
  }, [selectedMatchId, sourceEvents]);

  // ── Sync Analysis Depth with selections ──────────────────────────────────
  useEffect(() => {
    if (focusedPlayerId) setAnalysisDepth(3);
    else if (selectedMatchId) setAnalysisDepth(2);
    else setAnalysisDepth(1);
  }, [focusedPlayerId, selectedMatchId]);

  // ── Auto-configure layers based on depth ──────────────────────────────────
  useEffect(() => {
    if (analysisDepth === 1) { // Aggregate
      setShowPaths(false);
      setShowMarkers(true);
      setShowHeatmap(true);
      setIsPlaying(false);
    } else if (analysisDepth === 2) { // Match
      setShowPaths(true);
      setShowMarkers(true);
      setShowHeatmap(false);
    } else if (analysisDepth === 3) { // Player
      setShowPaths(true);
      setShowMarkers(true);
      setShowHeatmap(false);
    }
  }, [analysisDepth]);

  // ── Playback animation loop ───────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || matchDurationMs === 0) return;
    const tick = (timestamp) => {
      if (lastFrameRef.current === null) { lastFrameRef.current = timestamp; }
      const delta = (timestamp - lastFrameRef.current) * playbackSpeed;
      lastFrameRef.current = timestamp;
      setCurrentTimeMs(prev => {
        const next = prev + delta;
        if (next >= matchDurationMs) { setIsPlaying(false); return matchDurationMs; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); lastFrameRef.current = null; };
  }, [isPlaying, playbackSpeed, matchDurationMs]);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    setIsPlaying(false);
    setCurrentTimeMs(0);
  };

  const filteredEvents = useMemo(() => {
    if (!allEvents || allEvents.length === 0) return [];

    let result = [...allEvents];
    
    // FILTER 1: Match ID
    // Be careful — match_id may be string or number, coerce both sides
    if (selectedMatchId && selectedMatchId !== 'Full Day Aggregate') {
      result = result.filter(e => String(e.match_id) === String(selectedMatchId));
      console.log(`After match filter (${selectedMatchId}): ${result.length} events`);
    }
    
    // FILTER 2: Player type
    if (playerTypeFilter === 'human') {
      result = result.filter(e => e.player_type === 'human');
      console.log(`After human filter: ${result.length} events`);
    } else if (playerTypeFilter === 'bot') {
      result = result.filter(e => e.player_type === 'bot');
      console.log(`After bot filter: ${result.length} events`);
    }
    
    // FILTER 3: Active event types
    // Position events always pass through (needed for paths)
    // Only filter discrete events
    result = result.filter(e => {
      if (e.event === 'Position' || e.event === 'BotPosition') return true;
      return activeEvents.includes(e.event);
    });
    console.log(`After event type filter: ${result.length} events`);
    
    // FILTER 4: Timeline — only apply when a match is selected AND currentTimeMs > 0
    if (selectedMatchId && selectedMatchId !== 'Full Day Aggregate' && currentTimeMs > 0) {
      result = result.filter(e => e.ts <= currentTimeMs);
      console.log(`After timeline filter (${currentTimeMs}ms): ${result.length} events`);
    }
    
    return result;
  }, [allEvents, selectedMatchId, playerTypeFilter, activeEvents, currentTimeMs]);

  useEffect(() => {
    if (allEvents.length > 0) {
      runDataDiagnostic(allEvents, filteredEvents, selectedMap, selectedDate, selectedMatchId);
    }
    
    if (filteredEvents.length > 0) {
      const s = computeStats(filteredEvents);
      setStats(s);
      
      const sc = computeStormCircles(filteredEvents);
      setStormCircles(sc);
      
      const lz = computeLandingZones(filteredEvents);
      setLandingZones(lz);
      setLandingGrid(computeLandingGrid(lz, playerTypeFilter !== 'bot'));
      setTopLandingZones(getTopLandingZones(lz, playerTypeFilter !== 'bot'));
      
      setDeadZones(computeDeadZones(filteredEvents, availableMatches));
    } else {
      setStats(null);
      setStormCircles([]);
      setLandingZones([]);
      setLandingGrid(null);
      setTopLandingZones([]);
      setDeadZones([]);
    }
  }, [filteredEvents, playerTypeFilter, availableMatches, allEvents, selectedMap, selectedDate, selectedMatchId]);

  useEffect(() => {
    if (showStormCircle && stormCircles.length > 0 && selectedMatchId) {
      const minTs = Math.min(...filteredEvents.filter(e => (e.ts||0)>0).map(e=>e.ts), 0);
      setActiveCircle(getActiveCircle(stormCircles, currentTimeMs, minTs));
    } else {
      setActiveCircle(null);
    }
  }, [currentTimeMs, showStormCircle, stormCircles, selectedMatchId, filteredEvents]);

  const appState = {
    // Raw filter state — used by axiomContext.js destructuring
    selectedMap,
    selectedDate,
    selectedMatchId,
    playerTypeFilter,
    activeEvents,
    showHeatmap,
    heatmapMode,
    currentTimeMs,
    matchDurationMs,
    filteredEvents,
    allEvents,
    hoveredEvent,
    isolatedPlayer: focusedPlayerId,
    isUploadedData: viewMode === 'upload',
    uploadedMapName: viewMode === 'upload' ? selectedMap : null,

    // Pre-computed stats (also available for context strip in AxiomPanel)
    currentView: {
      map: selectedMap,
      date: selectedDate,
      match: selectedMatchId || 'Full Day Aggregate',
      playerFilter: playerTypeFilter,
      focusedPlayer: focusedPlayerId,
      depth: analysisDepth,
      activeEvents,
      heatmapActive: showHeatmap,
      heatmapMode,
      hotspotCount,
    },
    visibleData: {
      kills: filteredEvents.filter(e => e.event === 'Kill' || e.event === 'BotKill').length,
      stormDeaths: filteredEvents.filter(e => e.event === 'KilledByStorm').length,
      humanPlayers: [...new Set(filteredEvents.filter(e => !e.is_bot).map(e => e.user_id))].length,
    },
    hoveredEvent,
  };

  const heatmapGridKey = `${heatmapMode}_${playerTypeFilter}`;
  const activeHeatmapGrid = viewMode === 'upload' && uploadedData 
    ? (uploadedData.heatmaps?.[selectedMap]?.[heatmapGridKey] || null)
    : (heatmapGrids[heatmapGridKey] || null);

  // Derive the list of available players for the current match (used by FilterPanel)
  const availablePlayers = useMemo(() => {
    const matchEvents = selectedMatchId
      ? filteredEvents.filter(e => String(e.match_id) === String(selectedMatchId))
      : filteredEvents;
    return [...new Set(matchEvents.filter(e => !e.is_bot).map(e => e.user_id))].sort();
  }, [filteredEvents, selectedMatchId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg0)' }}>
      <Header
        viewMode={viewMode} onViewModeChange={handleViewModeChange}
        selectedMap={selectedMap} onMapChange={setSelectedMap}
        selectedMatchId={selectedMatchId} selectedDate={selectedDate}
        playerTypeFilter={playerTypeFilter} loading={loading}
        onClearUpload={() => { setUploadedData(null); setViewMode('built-in'); }}
        uploadedMapNames={uploadedData?.maps || []}
        axiomOpen={axiomOpen}
        isAxiomEnabled={isAxiomEnabled}
        onAxiomToggle={() => setAxiomOpen(!axiomOpen)}
      />

      <div style={{
        display: 'flex', background: '#090D14',
        borderBottom: '1px solid #1E2D42', flexShrink: 0,
      }}>
        {[
          { key: 'map',   icon: '◈', label: 'Map View'        },
          { key: 'stats', icon: '▦', label: 'Statistics'       },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveView(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 24px', background: activeView === t.key ? 'rgba(0,200,255,.05)' : 'transparent',
            border: 'none', borderBottom: activeView === t.key ? '2px solid #00C8FF' : '2px solid transparent',
            color: activeView === t.key ? '#00C8FF' : '#4B6280',
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600,
            letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer',
            transition: 'all .2s'
          }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {viewMode === 'upload' && !uploadedData ? (
          <UploadMode onUploadComplete={(data) => {
            const MAP_CONFIG = { 'AmbroseValley': 1, 'GrandRift': 1, 'Lockdown': 1 };
            const unknownMap = data.maps.find(m => !MAP_CONFIG[m]) || (data.maps.length === 0 ? "Unknown" : null);
            if (unknownMap) { setUploadedData(data); setNeedsConfig({ mapName: unknownMap });
            } else { setUploadedData(data); setSelectedMap(data.maps[0]); setSelectedDate(data.dates[0]); setSelectedMatchId(null); }
          }} />
        ) : viewMode === 'upload' && needsConfig ? (
          <CoordConfigScreen mapName={needsConfig.mapName} onApply={({ mapName, config, minimapUrl }) => {
            const updatedEvents = uploadedData.events.map(e => {
              const px = (e.x - config.origin_x) / config.scale * 1024;
              const py = (1 - (e.z - config.origin_z) / config.scale) * 1024;
              return { ...e, map: mapName, px: Math.round(Math.max(0, Math.min(1024, px)) * 10) / 10, py: Math.round(Math.max(0, Math.min(1024, py)) * 10) / 10 };
            });
            setUploadedData(prev => ({ ...prev, events: updatedEvents, maps: [mapName], mapConfigs: { [mapName]: { config, minimapUrl } } }));
            setNeedsConfig(null); setSelectedMap(mapName); setSelectedDate(uploadedData.dates[0]);
          }} />
        ) : activeView === 'stats' ? (
          <StatsDashboard 
            stats={stats} 
            landingEvents={landingZones} 
            topLandingZones={topLandingZones} 
            deadZones={deadZones} 
          />
        ) : (
          <>
            <FilterPanel
              selectedMap={selectedMap} onMapChange={setSelectedMap}
              selectedDate={selectedDate} onDateChange={setSelectedDate}
              selectedMatchId={selectedMatchId} onMatchChange={setSelectedMatchId}
              focusedPlayerId={focusedPlayerId} onFocusPlayerChange={setFocusedPlayerId}
              analysisDepth={analysisDepth} onAnalysisDepthChange={setAnalysisDepth}
              availablePlayers={availablePlayers}
              isAxiomEnabled={isAxiomEnabled} onAxiomEnabledChange={setIsAxiomEnabled}
              availableDates={viewMode === 'upload' ? (uploadedData?.dates || []) : availableDates}
              availableMatches={viewMode === 'upload' ? (uploadedData?.matches || []) : availableMatches}
              playerTypeFilter={playerTypeFilter} onPlayerTypeChange={setPlayerTypeFilter}
              activeEvents={activeEvents} onEventsChange={setActiveEvents}
              showPaths={showPaths} onShowPathsChange={setShowPaths}
              showMarkers={showMarkers} onShowMarkersChange={setShowMarkers}
              showHeatmap={showHeatmap} onShowHeatmapChange={setShowHeatmap}
              showMapImage={showMapImage} onShowMapImageChange={setShowMapImage}
              heatmapMode={heatmapMode} onHeatmapModeChange={setHeatmapMode}
              hotspotCount={hotspotCount} onHotspotCountChange={setHotspotCount}
              events={filteredEvents} matchDurationMs={matchDurationMs}
              showStormCircle={showStormCircle} onShowStormCircleChange={setShowStormCircle}
              showLandingZones={showLandingZones} onShowLandingZonesChange={setShowLandingZones}
              stats={stats}
            />

            <MapView
              selectedMap={selectedMap} events={filteredEvents}
              showPaths={showPaths} showMarkers={showMarkers}
              showHeatmap={showHeatmap} showMapImage={showMapImage}
              heatmapGrid={activeHeatmapGrid} heatmapMode={heatmapMode}
              playerTypeFilter={playerTypeFilter} loading={loading}
              selectedMatchId={selectedMatchId}
              focusedPlayerId={focusedPlayerId}
              hotspotCount={hotspotCount}
              customMapConfig={viewMode === 'upload' ? uploadedData?.mapConfigs?.[selectedMap]?.config : null}
              customMinimapUrl={viewMode === 'upload' ? uploadedData?.mapConfigs?.[selectedMap]?.minimapUrl : null}
              onEventHover={(e) => setHoveredEvent(e)}
              showStormCircle={showStormCircle} activeCircle={activeCircle}
              showLandingZones={showLandingZones} landingGrid={landingGrid} topLandingZones={topLandingZones}
            />

            {(isAxiomEnabled && axiomOpen) && (
              <AxiomPanel 
                ref={axiomRef}
                appState={appState}
                isOpen={axiomOpen}
                onClose={() => setAxiomOpen(false)}
              />
            )}
          </>
        )}
      </div>

      <Timeline
        currentTimeMs={currentTimeMs} onScrub={setCurrentTimeMs}
        matchDurationMs={matchDurationMs}
        isPlaying={isPlaying} onPlayPause={() => setIsPlaying(p => !p)}
        playbackSpeed={playbackSpeed} onSpeedChange={setPlaybackSpeed}
        disabled={!selectedMatchId}
      />
    </div>
  );
}

function Header({ 
  viewMode, onViewModeChange, 
  selectedMap, onMapChange, 
  selectedMatchId, selectedDate, 
  playerTypeFilter, loading,
  onClearUpload,
  uploadedMapNames = [],
  axiomOpen, isAxiomEnabled, onAxiomToggle
}) {
  return (
    <div style={{
      height: 48, background: 'var(--bg1)', borderBottom: '1px solid var(--border-dim)',
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0,
      position: 'relative', zIndex: 100,
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-0)', letterSpacing: '-.01em' }}>
        LILA<span style={{ color: 'var(--accent)' }}>.</span>MAPS
      </div>

      <div style={{ display: 'flex', gap: 2, marginLeft: 24, background: 'var(--bg2)', padding: 2, borderRadius: 4 }}>
        <button onClick={() => onViewModeChange('built-in')} style={{ background: viewMode === 'built-in' ? 'var(--bg4)' : 'transparent', color: viewMode === 'built-in' ? 'var(--text-0)' : 'var(--text-3)', border: 'none', padding: '6px 16px', borderRadius: 3, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, transition: 'all .2s' }}>Built-in Data</button>
        <button onClick={() => onViewModeChange('upload')} style={{ background: viewMode === 'upload' ? 'var(--bg4)' : 'transparent', color: viewMode === 'upload' ? 'var(--text-0)' : 'var(--text-3)', border: 'none', padding: '6px 16px', borderRadius: 3, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, transition: 'all .2s' }}>↑ Upload Data</button>
      </div>

      {viewMode === 'built-in' ? (
        <div style={{ display: 'flex', gap: 1, background: 'var(--border-dim)', marginLeft: 16 }}>
          {['AmbroseValley', 'GrandRift', 'Lockdown'].map(map => (
            <button key={map} onClick={() => onMapChange(map)} style={{ fontFamily: 'var(--font-condensed)', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', padding: '6px 14px', background: selectedMap === map ? 'var(--accent)' : 'var(--bg3)', color: selectedMap === map ? '#000' : 'var(--text-3)', border: 'none', cursor: 'pointer', transition: 'all .15s' }}>{map}</button>
          ))}
        </div>
      ) : (
        <div style={{ marginLeft: 16, display: 'flex', gap: 1, background: 'var(--border-dim)' }}>
           {uploadedMapNames.map(map => (
            <button key={map} onClick={() => onMapChange(map)} style={{ fontFamily: 'var(--font-condensed)', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', padding: '6px 14px', background: selectedMap === map ? 'var(--accent)' : 'var(--bg3)', color: selectedMap === map ? '#000' : 'var(--text-3)', border: 'none', cursor: 'pointer', transition: 'all .15s' }}>{map || 'Unknown'}</button>
          ))}
        </div>
      )}

      {viewMode === 'upload' && (
        <div style={{ marginLeft: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#000', background: 'var(--accent)', padding: '4px 10px', fontWeight: 700, borderRadius: 2 }}>↑ UPLOADED</span>
          {onClearUpload && <button onClick={onClearUpload} style={{ background: 'transparent', border: '1px solid var(--border-bright)', color: 'var(--text-2)', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10 }}>CLEAR</button>}
        </div>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
        {loading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '.1em' }}>LOADING...</span>}

        {isAxiomEnabled && (
          <button 
            onClick={onAxiomToggle}
            style={{
              fontFamily: "'Barlow Condensed',sans-serif",
              fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', padding: '5px 14px',
              background: axiomOpen ? 'var(--accent)' : 'rgba(0,200,255,.08)',
              color: axiomOpen ? '#000' : 'var(--accent)',
              border: '1px solid var(--accent)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all .15s',
            }}
          >
            <AxiomLogo size={14} animated={!axiomOpen} />
            {axiomOpen ? 'CLOSE' : 'AXIOM'}
          </button>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selectedDate && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--bg3)', border: '1px solid var(--border-dim)', padding: '4px 10px' }}>{selectedDate}</span>}
            {selectedMatchId && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', background: 'var(--accent-glow)', border: '1px solid rgba(0,200,255,.3)', padding: '4px 10px' }}>{selectedMatchId.split('.')[0]}</span>}
        </div>
      </div>
    </div>
  );
}
