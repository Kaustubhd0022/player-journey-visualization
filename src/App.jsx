import { useState, useEffect, useRef, useCallback } from 'react';
import { loadEvents, loadHeatmaps, loadIndex } from './dataLoader';
import FilterPanel from './FilterPanel';
import MapView from './MapView';
import Timeline from './Timeline';
import UploadMode from './UploadMode';
import CoordConfigScreen from './CoordConfigScreen';
import AxiomPanel from './AxiomPanel';
import AxiomLogo from './AxiomLogo';
import './styles/globals.css';

export default function App() {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedMap,      setSelectedMap]      = useState('AmbroseValley');
  const [selectedDate,     setSelectedDate]      = useState(null);
  const [selectedMatchId,  setSelectedMatchId]   = useState(null);
  const [playerTypeFilter, setPlayerTypeFilter]  = useState('human'); // 'all'|'human'|'bot'
  const [activeEvents,     setActiveEvents]       = useState(['Kill', 'BotKill', 'Killed', 'BotKilled', 'Loot', 'KilledByStorm']);

  // ── Layer state ───────────────────────────────────────────────────────────
  const [showPaths, setShowPaths] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showMapImage, setShowMapImage] = useState(true);
  const [heatmapMode,  setHeatmapMode]  = useState('kill'); // 'kill'|'death'|'movement'

  // ── Timeline state ────────────────────────────────────────────────────────
  const [currentTimeMs,   setCurrentTimeMs]   = useState(0);
  const [isPlaying,       setIsPlaying]        = useState(false);
  const [playbackSpeed,   setPlaybackSpeed]    = useState(1);
  const [matchDurationMs, setMatchDurationMs]  = useState(0);

  // ── AI State ──────────────────────────────────────────────────────────────
  const [axiomOpen, setAxiomOpen]     = useState(false);
  const axiomRef = useRef(null);
  const prevPhaseRef = useRef(null);
  const [hoveredEvent, setHoveredEvent] = useState(null);

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
      setHeatmapGrids(heatmapData || {});
      setLoading(false);
    }
).catch(err => {
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
      setCurrentTimeMs(0);
      return;
    }
    const matchEvents = sourceEvents.filter(e => e.match_id === selectedMatchId);
    const maxTs = Math.max(...matchEvents.map(e => e.ts), 0);
    setMatchDurationMs(maxTs);
    setCurrentTimeMs(0);
  }, [selectedMatchId, sourceEvents]);

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

  // ── AI Context and Triggers ──────────────────────────────────────────────
  const triggerAxiom = useCallback((type, payload) => {
    if (axiomOpen) {
      axiomRef.current?.triggerAI(type, payload);
    } else {
      // Passive badge increment removed for less intrusion
      // setAxiomBadge(b => Math.min(b + 1, 9));
    }
  }, [axiomOpen]);

  // Automatic triggers removed as per user request for less chattiness
  /*
  useEffect(() => { if (selectedMatchId) triggerAxiom('MATCH_SELECTED', selectedMatchId); }, [selectedMatchId, triggerAxiom]);
  useEffect(() => { if (showHeatmap) triggerAxiom('HEATMAP_CHANGE', heatmapMode); }, [heatmapMode, showHeatmap, triggerAxiom]);

  useEffect(() => {
    if (!matchDurationMs || !selectedMatchId) return;
    const pct = currentTimeMs / matchDurationMs;
    const phase = pct < 0.33 ? 'early' : pct < 0.66 ? 'mid' : 'late';
    if (phase !== prevPhaseRef.current) {
      prevPhaseRef.current = phase;
      triggerAxiom('TIMELINE_PHASE', phase);
    }
  }, [currentTimeMs, matchDurationMs, selectedMatchId, triggerAxiom]);
  */

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    setIsPlaying(false);
    setCurrentTimeMs(0);
  };

  const filteredEvents = sourceEvents.filter(e => {
    if (selectedMatchId && e.match_id !== selectedMatchId) return false;
    if (playerTypeFilter === 'human' && e.player_type !== 'human') return false;
    if (playerTypeFilter === 'bot'   && e.player_type !== 'bot')   return false;
    const isPosition = e.event === 'Position' || e.event === 'BotPosition';
    if (!isPosition && !activeEvents.includes(e.event)) return false;
    if (selectedMatchId && currentTimeMs > 0 && e.ts > currentTimeMs) return false;
    return true;
  });

  const appState = {
    selectedMap, selectedDate, selectedMatchId,
    playerTypeFilter, activeEvents,
    showHeatmap, heatmapMode,
    currentTimeMs, matchDurationMs,
    filteredEvents,
    allEvents: sourceEvents,
    hoveredEvent,
    isUploadedData: viewMode === 'upload',
    uploadedMapName: selectedMap,
  };

  const heatmapGridKey = `${heatmapMode}_${playerTypeFilter}`;
  const activeHeatmapGrid = viewMode === 'upload' && uploadedData 
    ? (uploadedData.heatmaps?.[selectedMap]?.[heatmapGridKey] || null)
    : (heatmapGrids[heatmapGridKey] || null);

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
        onAxiomToggle={() => setAxiomOpen(!axiomOpen)}
        onAxiomSuggestion={(text) => {
            setAxiomOpen(true);
            setTimeout(() => axiomRef.current?.sendMessage(text), 300);
        }}
      />

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
        ) : (
          <>
            <FilterPanel
              selectedMap={selectedMap} onMapChange={setSelectedMap}
              selectedDate={selectedDate} onDateChange={setSelectedDate}
              selectedMatchId={selectedMatchId} onMatchChange={setSelectedMatchId}
              availableDates={viewMode === 'upload' ? (uploadedData?.dates || []) : availableDates}
              availableMatches={viewMode === 'upload' ? (uploadedData?.matches || []) : availableMatches}
              playerTypeFilter={playerTypeFilter} onPlayerTypeChange={setPlayerTypeFilter}
              activeEvents={activeEvents} onEventsChange={setActiveEvents}
              showPaths={showPaths} onShowPathsChange={setShowPaths}
              showMarkers={showMarkers} onShowMarkersChange={setShowMarkers}
              showHeatmap={showHeatmap} onShowHeatmapChange={setShowHeatmap}
              showMapImage={showMapImage} onShowMapImageChange={setShowMapImage}
              heatmapMode={heatmapMode} onHeatmapModeChange={setHeatmapMode}
              events={filteredEvents} matchDurationMs={matchDurationMs}
            />

            <MapView
              selectedMap={selectedMap} events={filteredEvents}
              showPaths={showPaths} showMarkers={showMarkers}
              showHeatmap={showHeatmap} showMapImage={showMapImage}
              heatmapGrid={activeHeatmapGrid} heatmapMode={heatmapMode}
              playerTypeFilter={playerTypeFilter} loading={loading}
              selectedMatchId={selectedMatchId}
              customMapConfig={viewMode === 'upload' ? uploadedData?.mapConfigs?.[selectedMap]?.config : null}
              customMinimapUrl={viewMode === 'upload' ? uploadedData?.mapConfigs?.[selectedMap]?.minimapUrl : null}
              onEventHover={(e) => { setHoveredEvent(e); triggerAxiom('EVENT_HOVER', e); }}
            />

            <AxiomPanel 
                ref={axiomRef}
                appState={appState}
                isOpen={axiomOpen}
                onClose={() => setAxiomOpen(false)}
            />
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
  axiomOpen, onAxiomToggle,
  onAxiomSuggestion
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
        
        <div style={{ position: 'relative' }}>
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

            {/* AxiomSuggestionPopup removed */}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selectedDate && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--bg3)', border: '1px solid var(--border-dim)', padding: '4px 10px' }}>{selectedDate}</span>}
            {selectedMatchId && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', background: 'var(--accent-glow)', border: '1px solid rgba(0,200,255,.3)', padding: '4px 10px' }}>{selectedMatchId.split('.')[0]}</span>}
        </div>
      </div>
    </div>
  );
}
