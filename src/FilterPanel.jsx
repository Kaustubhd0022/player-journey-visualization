import { COLORS, EVENTS } from './constants';
import StatsPanel from './StatsPanel';

export default function FilterPanel({
  selectedMap,         onMapChange,
  selectedDate,        onDateChange,
  selectedMatchId,     onMatchChange,
  availableDates,
  availableMatches,
  playerTypeFilter,    onPlayerTypeChange,
  activeEvents,        onEventsChange,
  showPaths,           onShowPathsChange,
  showMarkers,         onShowMarkersChange,
  showHeatmap,         onShowHeatmapChange,
  showMapImage,        onShowMapImageChange,
  heatmapMode,         onHeatmapModeChange,
  isAxiomEnabled,      onAxiomEnabledChange,
  events,
  matchDurationMs
}) {
  const toggleEvent = (evt) => {
    if (activeEvents.includes(evt)) {
      onEventsChange(activeEvents.filter(e => e !== evt));
    } else {
      onEventsChange([...activeEvents, evt]);
    }
  };

  return (
    <div style={{
      width: 280, background: 'var(--bg1)', borderRight: '1px solid var(--border-dim)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0,
      zIndex: 100
    }}>
      {/* Map Selection */}
      <div className="filter-section">
        <label className="control-label">LOCATION</label>
        <select 
          value={selectedMap} 
          onChange={(e) => onMapChange(e.target.value)}
          style={{ width: '100%', background: 'var(--bg2)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: '8px', fontFamily: 'var(--font-ui)', outline: 'none' }}
        >
          {['AmbroseValley', 'GrandRift', 'Lockdown'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Date Selection */}
      <div className="filter-section">
        <label className="control-label">TEMPORAL SCAN</label>
        <select 
          value={selectedDate || ''} 
          onChange={(e) => onDateChange(e.target.value)}
          style={{ width: '100%', background: 'var(--bg2)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: '8px', fontFamily: 'var(--font-ui)', outline: 'none' }}
        >
          {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Match Selection */}
      <div className="filter-section">
        <label className="control-label">MATCH FOCUS (NULL = AGGREGATE)</label>
        <select 
          value={selectedMatchId || ''} 
          onChange={(e) => onMatchChange(e.target.value || null)}
          style={{ width: '100%', background: 'var(--bg2)', color: 'var(--text-1)', border: '1px solid var(--border)', padding: '8px', fontFamily: 'var(--font-ui)', outline: 'none' }}
        >
          <option value="">Full Day Aggregate</option>
          {availableMatches.map(m => <option key={m} value={m}>{m.split('.')[0]}</option>)}
        </select>
      </div>

      {/* Player Type */}
      <div className="filter-section">
        <label className="control-label">PLAYER SEGMENT</label>
        <div className="segmented-control">
          {['all', 'human', 'bot'].map(type => (
            <button 
              key={type} 
              className={playerTypeFilter === type ? 'active' : ''}
              onClick={() => onPlayerTypeChange(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Layer Toggles */}
      <div className="filter-section">
        <label className="control-label">VISUAL LAYERS</label>
        
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', marginBottom: 8 }}>
          <span style={{ fontSize:13, color:'var(--text-1)' }}>Show Map</span>
          <div
            onClick={() => onShowMapImageChange(!showMapImage)}
            style={{
              width:40, height:22,
              background: showMapImage ? 'var(--accent-dim)' : 'var(--bg4)',
              border: `1px solid ${showMapImage ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius:11, position:'relative', cursor:'pointer', transition:'all .15s'
            }}
          >
            <div style={{
              position:'absolute',
              top:3,
              left: showMapImage ? 21 : 3,
              width:14, height:14, borderRadius:'50%',
              background: showMapImage ? '#000' : 'var(--text-3)',
              transition:'left .15s'
            }}/>
          </div>
        </div>

        <div className="switch-item">
          <span className="checkbox-label">Show Paths</span>
          <label className="switch">
            <input type="checkbox" checked={showPaths} onChange={e => onShowPathsChange(e.target.checked)} />
            <span className="slider"></span>
          </label>
        </div>
        <div className="switch-item">
          <span className="checkbox-label">Show Event Markers</span>
          <label className="switch">
            <input type="checkbox" checked={showMarkers} onChange={e => onShowMarkersChange(e.target.checked)} />
            <span className="slider"></span>
          </label>
        </div>
        <div className="switch-item">
          <span className="checkbox-label">Show Density Heatmap</span>
          <label className="switch">
            <input type="checkbox" checked={showHeatmap} onChange={e => onShowHeatmapChange(e.target.checked)} />
            <span className="slider"></span>
          </label>
        </div>
      </div>

      {/* Heatmap Mode (Conditional) */}
      {showHeatmap && (
        <div className="filter-section" style={{ background: 'var(--bg2)' }}>
          <label className="control-label">DENSITY MODE</label>
          <div className="segmented-control">
            {[
              { id: 'kill', label: 'Kill' },
              { id: 'death', label: 'Death' },
              { id: 'movement', label: 'Move' }
            ].map(m => (
              <button 
                key={m.id} 
                className={heatmapMode === m.id ? 'active' : ''}
                onClick={() => onHeatmapModeChange(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Event Types */}
      <div className="filter-section">
        <label className="control-label">EVENT FILTERS</label>
        <div className="checkbox-group">
          {[
            { id: 'Kill', label: 'Human Kills', color: '#3B82F6' },
            { id: 'BotKill', label: 'Bot Kills', color: '#3B82F6' },
            { id: 'Killed', label: 'Human Deaths', color: '#EF4444' },
            { id: 'BotKilled', label: 'Bot Deaths', color: '#EF4444' },
            { id: 'Loot', label: 'Loot Pickup', color: '#22C55E' },
            { id: 'KilledByStorm', label: 'Storm Death', color: '#FACC15' },
          ].map(evt => (
            <div key={evt.id} className="checkbox-item" onClick={() => toggleEvent(evt.id)}>
              <div 
                className={`checkbox-box ${activeEvents.includes(evt.id) ? 'checked' : ''}`}
                style={{ '--color': evt.color }}
              >
                {activeEvents.includes(evt.id) && <div style={{ width: 8, height: 8, background: '#000' }} />}
              </div>
              <span className="checkbox-label">{evt.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Assistant Toggle */}
      <div className="filter-section" style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 16 }}>
        <label className="control-label">AI ASSISTANT</label>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0' }}>
          <span style={{ fontSize:13, color:'var(--text-1)' }}>Enable AXIOM</span>
          <div
            onClick={() => onAxiomEnabledChange(!isAxiomEnabled)}
            style={{
              width:40, height:22,
              background: isAxiomEnabled ? 'var(--accent-dim)' : 'var(--bg4)',
              border: `1px solid ${isAxiomEnabled ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius:11, position:'relative', cursor:'pointer', transition:'all .15s'
            }}
          >
            <div style={{
              position:'absolute',
              top:3,
              left: isAxiomEnabled ? 21 : 3,
              width:14, height:14, borderRadius:'50%',
              background: isAxiomEnabled ? '#000' : 'var(--text-3)',
              transition:'left .15s'
            }}/>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          DIRECT SPATIAL INTELLIGENCE
        </div>
      </div>

      {/* Stats Panel */}
      <div style={{ marginTop: 'auto' }}>
        <StatsPanel 
            events={events} 
            selectedMatchId={selectedMatchId}
            matchDurationMs={matchDurationMs} 
            playerTypeFilter={playerTypeFilter}
        />
      </div>
    </div>
  );
}
