import { useEffect, useRef, useState, useCallback } from 'react';
import Plotly from 'plotly.js-dist';
import { COLORS, EVENTS, MINIMAP_SIZE } from './constants';
import { gridToBase64, generateFallbackGrid, landingGridToBase64 } from './HeatmapRenderer';
import { clusterEvents } from './ZoneAnalyzer';

const HUMAN_PALETTE = COLORS.humanPalette;

export default function MapView({ 
  selectedMap, events, showPaths, showMarkers, 
  showHeatmap, heatmapGrid, heatmapMode, 
  playerTypeFilter, loading, selectedMatchId, 
  focusedPlayerId, onFocusPlayerChange,
  hotspotCount,
  showMapImage, customMapConfig, customMinimapUrl,
  onEventHover, onMapClick, axiomOpen,
  showStormCircle, activeCircle,
  showLandingZones, landingGrid, topLandingZones
}) {
  console.log('MapView render — storm props:', {
    showStormCircle,
    activeCircle,
    stormCircles: events?.length, // Closest proxy we have to stormCircles length here if not passed separately, but implementation plan says it should be passed.
  });
  const plotRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const [clickFlash, setClickFlash] = useState(null);

  const getMinimapUrl = (map) => {
    if (customMinimapUrl) return customMinimapUrl;
    return `/static/minimaps/${map}.png`;
  };

  const buildTraces = useCallback(() => {
    const traces = [];
    
    console.log('Building traces from', events.length, 'events');
    
    // ── PATHS ─────────────────────────────────────────────────────────────────
    if (showPaths) {
      const posEvents = events.filter(e => e.event === 'Position' || e.event === 'BotPosition');
      console.log('Position events for paths:', posEvents.length);
      
      // Group by player
      const byPlayer = {};
      posEvents.forEach(e => {
        if (!byPlayer[e.user_id]) byPlayer[e.user_id] = [];
        byPlayer[e.user_id].push(e);
      });
      
      const HUMAN_COLORS = ['#3B82F6','#22C55E','#F97316','#A78BFA','#EC4899','#14B8A6','#F59E0B','#EF4444'];
      let humanIdx = 0;
      
      Object.entries(byPlayer).forEach(([uid, evts]) => {
        const sorted = [...evts].sort((a, b) => a.ts - b.ts);
        const isBot  = uid.startsWith('BOT_') || evts[0]?.player_type === 'bot';
        
        // Null-separate segments to avoid lines connecting distant points
        // Add null between points that are far apart in time (>30s gap)
        const x = [], y = [];
        sorted.forEach((e, i) => {
          if (i > 0 && (e.ts - sorted[i-1].ts) > 30000) {
            x.push(null); y.push(null); // breaks the line
          }
          x.push(e.px);
          y.push(1024 - e.py); // Plotly y-axis: flip so 0 is bottom
        });
        
        const opacity = focusedPlayerId
          ? (focusedPlayerId === uid ? 1.0 : 0.06)
          : isBot ? 0.75 : 0.8;
        
        traces.push({
          type: 'scattergl',
          mode: 'lines',
          x, y,
          line: {
            color: isBot ? '#9CA3AF' : HUMAN_COLORS[humanIdx % HUMAN_COLORS.length],
            width: 2,
            dash: isBot ? 'dash' : 'solid',
          },
          opacity,
          name: uid,
          hoverinfo: 'none',
          showlegend: false,
        });
        
        if (!isBot) humanIdx++;
      });
      
      console.log('Path traces created:', Object.keys(byPlayer).length);
    }
    
    // ── MARKERS ───────────────────────────────────────────────────────────────
    if (showMarkers) {
      const EVENT_CONFIG = {
        Kill:          { color: '#3B82F6', size: 8, symbol: 'cross' },
        BotKill:       { color: '#3B82F6', size: 8, symbol: 'cross' },
        Killed:        { color: '#EF4444', size: 8, symbol: 'circle-open' },
        BotKilled:     { color: '#EF4444', size: 8, symbol: 'circle-open' },
        Loot:          { color: '#22C55E', size: 6, symbol: 'square' },
        KilledByStorm: { color: '#FACC15', size: 8, symbol: 'diamond' },
      };
      
      const markerEvents = events.filter(e => EVENT_CONFIG[e.event]);
      console.log('Marker events to render:', markerEvents.length);
      
      // Group by event type for separate traces (better performance + individual toggle)
      Object.entries(EVENT_CONFIG).forEach(([evtType, cfg]) => {
        const evts = markerEvents.filter(e => e.event === evtType);
        if (evts.length === 0) return;
        
        console.log(`  ${evtType}: ${evts.length} events`);
        
        traces.push({
          type: 'scattergl',
          mode: 'markers',
          x: evts.map(e => e.px),
          y: evts.map(e => 1024 - e.py), // flip y-axis
          marker: {
            color: cfg.color,
            size: cfg.size,
            symbol: cfg.symbol,
            opacity: evts.map(e => e.player_type === 'bot' ? 0.8 : 0.9),
            line: { width: 0 },
          },
          text: evts.map(e => {
            const mins = Math.floor((e.ts || 0) / 60000);
            const secs = String(Math.floor(((e.ts || 0) % 60000) / 1000)).padStart(2, '0');
            return `<b>${evtType}</b><br>${e.user_id}<br>T+${mins}:${secs}<br>(${Math.round(e.px)}, ${Math.round(e.py)})`;
          }),
          hovertemplate: '%{text}<extra></extra>',
          hoverlabel: {
            bgcolor: '#090D14',
            bordercolor: cfg.color,
            font: { color: '#E2E8F0', size: 12 },
          },
          name: evtType,
          showlegend: false,
          customdata: evts,
        });
      });
    }

    // ── HOTSPOT LABELS ─────────────────────────────────────────────────────
    if (showHeatmap && hotspotCount > 0) {
      // Clustering depends on the current heatmap mode's events
      const relevantEvents = events.filter(e => {
        if (heatmapMode === 'kill') return e.event === 'Kill' || e.event === 'BotKill';
        if (heatmapMode === 'death') return e.event === 'Killed' || e.event === 'BotKilled' || e.event === 'KilledByStorm';
        if (heatmapMode === 'movement') return e.event === 'Position' || e.event === 'BotPosition';
        return false;
      });

      const clusters = clusterEvents(relevantEvents, hotspotCount);
      
      traces.push({
        type: 'scattergl', mode: 'text',
        x: clusters.map(c => c.x),
        y: clusters.map(c => 1024 - c.y),
        text: clusters.map(c => `🔥 ${c.displayCount}`),
        textposition: 'top center',
        textfont: {
          family: 'var(--font-mono)',
          size: 14,
          color: 'var(--accent)',
          weight: 700
        },
        hoverinfo: 'none',
        showlegend: false
      });
    }
    
    // ── STORM CIRCLE ──────────────────────────────────────────────────────────
    if (showStormCircle && activeCircle) {
      console.log('Drawing storm circle:', activeCircle);

      const POINTS = 100;
      const { cx, cy, radius } = activeCircle;

      // Validate: don't draw if values are unreasonable
      if (cx > 0 && cy > 0 && radius > 0 && radius < 800) {

        // Main circle border
        const circleX = [];
        const circleY = [];
        for (let i = 0; i <= POINTS; i++) {
          const angle = (i / POINTS) * 2 * Math.PI;
          circleX.push(cx + radius * Math.cos(angle));
          circleY.push(cy + radius * Math.sin(angle));
        }

        traces.push({
          type: 'scatter',    // NOT scattergl — scatter supports line styling better for circles
          mode: 'lines',
          x: circleX,
          y: circleY,
          line: {
            color: '#FACC15',
            width: 2.5,
            dash: 'dot',
          },
          fill: 'none',
          opacity: 0.9,
          hoverinfo: 'skip',
          showlegend: false,
          name: 'Storm boundary',
        });

        // Subtle outer danger zone ring
        const outerX = [], outerY = [];
        for (let i = 0; i <= POINTS; i++) {
          const angle = (i / POINTS) * 2 * Math.PI;
          outerX.push(cx + (radius + 20) * Math.cos(angle));
          outerY.push(cy + (radius + 20) * Math.sin(angle));
        }

        traces.push({
          type: 'scatter',
          mode: 'lines',
          x: outerX,
          y: outerY,
          line: { color: 'rgba(250,204,21,0.2)', width: 12 },
          fill: 'none',
          opacity: 0.6,
          hoverinfo: 'skip',
          showlegend: false,
          name: 'Storm zone',
        });

        // Center marker
        traces.push({
          type: 'scatter',
          mode: 'markers+text',
          x: [cx],
          y: [cy],
          marker: {
            color: '#FACC15',
            size: 8,
            symbol: 'cross-thin-open',
            line: { color: '#FACC15', width: 2 },
          },
          text: ['Safe zone'],
          textposition: 'top center',
          textfont: {
            family: "'JetBrains Mono',monospace",
            size: 10,
            color: '#FACC15',
          },
          hoverinfo: 'text',
          hovertext: `Safe zone center (${cx}, ${cy})\nRadius: ${radius}px`,
          showlegend: false,
          name: 'Safe center',
        });

      } else {
        console.warn('Storm circle values out of range:', activeCircle);
      }
    }

    // ── LANDING ZONES ─────────────────────────────────────────────────────────
    if (showLandingZones && topLandingZones?.length > 0) {
      topLandingZones.slice(0, 5).forEach((zone, i) => {
        traces.push({
          type: 'scattergl', mode: 'markers+text',
          x: [zone.px], y: [1024 - zone.py],
          marker: {
            color: i === 0 ? '#00C8FF' : '#A78BFA',
            size: i === 0 ? 14 : 10,
            symbol: 'diamond',
            line: { color: '#fff', width: 1.5 },
          },
          text: [`LZ ${i+1}\n${zone.pct}%`],
          textposition: 'top center',
          textfont: { family: "'JetBrains Mono',monospace", size: 9, color: '#E2E8F0' },
          hovertext: `Landing Zone ${i+1}<br>${zone.count} players (${zone.pct}%)<br>Cell (${zone.cx}, ${zone.cy})`,
          hoverinfo: 'text',
          showlegend: false,
        });
      });
    }
    
    console.log('Total traces:', traces.length);
    return traces;
  }, [events, showPaths, showMarkers, focusedPlayerId, showMapImage, showHeatmap, hotspotCount, heatmapMode, showStormCircle, activeCircle, showLandingZones, topLandingZones]);

  useEffect(() => {
    if (!plotRef.current) return;

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor:  'rgba(0,0,0,0)',
      margin: { l: 0, r: 0, t: 0, b: 0 },
      xaxis: {
        range: [0, 1024],
        showgrid: false, zeroline: false, showticklabels: false,
        fixedrange: false,
      },
      yaxis: {
        range: [0, 1024], // matches flipped py = 1024 - original_py
        showgrid: false, zeroline: false, showticklabels: false,
        fixedrange: false,
        scaleanchor: 'x',
        scaleratio: 1,
      },
      dragmode: 'pan',
      hovermode: 'closest',
      images: (() => {
        const imgs = [];
        if (showMapImage) {
          imgs.push({
            source: getMinimapUrl(selectedMap),
            xref: 'x', yref: 'y',
            x: 0,    y: 1024,
            sizex: 1024, sizey: 1024,
            sizing: 'stretch',
            opacity: 1,
            layer: 'below',
          });
        }
        
        // --- Heatmap / Landing Selection logic (Fix D) ---
        let heatmapImage = null;
        if (showHeatmap || showLandingZones) {
          if (heatmapMode === 'landing' || showLandingZones) {
            if (landingGrid && Math.max(...landingGrid.flat()) > 0) {
              heatmapImage = gridToBase64(landingGrid, 'landing');
            } else {
              console.warn('Landing grid missing or empty — drop zones will not render');
            }
          } else if (showHeatmap) {
            let hmGrid = heatmapGrid;
            if (!hmGrid) {
              hmGrid = generateFallbackGrid(events, heatmapMode);
            }
            if (hmGrid) {
              heatmapImage = gridToBase64(hmGrid, heatmapMode);
            }
          }
        }

        if (heatmapImage) {
          imgs.push({
            source: heatmapImage,
            xref: 'x', yref: 'y',
            x: 0,    y: 1024,
            sizex: 1024, sizey: 1024,
            sizing: 'stretch',
            opacity: 0.72,
            layer: 'above',
          });
        }

        return imgs;
      })(),
    };  

    const config = {
      displayModeBar: false,
      scrollZoom: true,
      responsive: true,
    };

    Plotly.react(plotRef.current, buildTraces(), layout, config);

    // Events
    const handleRef = plotRef.current;
    
    const onClick = (data) => {
      const point = data.points?.[0];
      if (!point) return;
      const uid = point.data?.customdata?.[point.pointNumber]?.user_id ||
                  (typeof point.data?.customdata?.[0] === 'string' ? point.data.customdata[0] : null);
      if (uid && typeof uid === 'string' && onFocusPlayerChange) {
        onFocusPlayerChange(uid === focusedPlayerId ? null : uid);
      }
      // Map zone click → AXIOM
      if (onMapClick) {
        const px = Math.round(point.x);
        const py = Math.round(1024 - point.y);
        setClickFlash({ x: point.x, y: point.y });
        setTimeout(() => setClickFlash(null), 1500);
        onMapClick({ px, py, x: point.x, y: point.y });
      }
    };

    const onHover = (data) => {
        // AI hover briefing removed as per user request for less chattiness
        /*
        const point = data.points[0];
        const evt = point.data.customdata?.[point.pointNumber];
        if (evt && evt.event && onEventHover) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = setTimeout(() => {
                onEventHover(evt);
            }, 1500);
        }
        */
    };

    const onUnhover = () => {
        clearTimeout(hoverTimerRef.current);
    };

    handleRef.on('plotly_click', onClick);
    handleRef.on('plotly_hover', onHover);
    handleRef.on('plotly_unhover', onUnhover);

    return () => {
        handleRef.removeAllListeners('plotly_click');
        handleRef.removeAllListeners('plotly_hover');
        handleRef.removeAllListeners('plotly_unhover');
    };
  }, [selectedMap, buildTraces, showHeatmap, heatmapGrid, heatmapMode, focusedPlayerId, showMapImage, onEventHover, onFocusPlayerChange, onMapClick]);

  return (
    <div style={{ flex: 1, background: 'var(--bg0)', position: 'relative', overflow: 'hidden' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,8,16,.7)', zIndex: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 13, letterSpacing: '.15em' }}>LOADING DATA...</div>
        </div>
      )}

      {!loading && events.length === 0 && (
         <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontSize: 12, letterSpacing: '.1em', background: 'var(--bg1)', padding: '10px 20px', border: '1px solid var(--border-dim)' }}>
                NO EVENTS FOR THIS SELECTION
            </div>
         </div>
      )}

      <div ref={plotRef} style={{ width: '100%', height: '100%' }} />

      {/* Storm circle approximation disclaimer */}
      {showStormCircle && activeCircle && (
        <div style={{
          position:'absolute', bottom:80, left:16, zIndex:10,
          fontFamily:"'JetBrains Mono',monospace", fontSize:9,
          color:'rgba(250,204,21,.5)', letterSpacing:'.08em',
          background:'rgba(5,8,16,.85)', padding:'3px 10px',
          border:'1px solid rgba(250,204,21,.15)',
          pointerEvents:'none',
        }}>
          ◎ Storm boundary approximated — enable yellow markers to verify
        </div>
      )}

      {/* AXIOM active hint */}
      {axiomOpen && (
        <div style={{
          position:'absolute', bottom:showStormCircle && activeCircle ? 106 : 80,
          left:'50%', transform:'translateX(-50%)',
          fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'rgba(0,200,255,.5)',
          letterSpacing:'.1em', pointerEvents:'none', whiteSpace:'nowrap',
          background:'rgba(5,8,16,.85)', padding:'4px 12px',
          border:'1px solid rgba(0,200,255,.15)',
        }}>
          ◈ AXIOM ACTIVE — click any map location to analyze that zone
        </div>
      )}

      {/* Click ripple */}
      {clickFlash && (
        <div style={{
          position:'absolute',
          left: `${(clickFlash.x / 1024) * 100}%`,
          top:  `${((1024 - clickFlash.y) / 1024) * 100}%`,
          transform:'translate(-50%,-50%)',
          width:40, height:40, borderRadius:'50%',
          border:'2px solid #00C8FF',
          animation:'clickRipple .8s ease-out forwards',
          pointerEvents:'none', zIndex:20,
        }}/>
      )}
      <style>{`
        @keyframes clickRipple {
          0%  { transform:translate(-50%,-50%) scale(0.5); opacity:1; }
          100%{ transform:translate(-50%,-50%) scale(2.5); opacity:0; }
        }
      `}</style>

      {/* Legend */}
      <Legend />

      {/* Focused player indicator */}
      {focusedPlayerId && (
        <div style={{
          position: 'absolute', top: 16, left: 16, background: 'rgba(9,13,20,.92)',
          border: '1px solid var(--kill)', padding: '6px 12px', zIndex: 10,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--kill)',
        }}>
          ISOLATED: {focusedPlayerId} — <span style={{ color: 'var(--text-3)', cursor: 'pointer' }} onClick={() => onFocusPlayerChange(null)}>ESC to clear</span>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16,
      background: 'rgba(9,13,20,.92)', border: '1px solid var(--border)',
      padding: '12px 14px', zIndex: 10, backdropFilter: 'blur(8px)',
    }}>
      {[
        { color: '#3B82F6',  label: 'Kills' },
        { color: '#EF4444', label: 'Deaths' },
        { color: '#22C55E',  label: 'Loot' },
        { color: '#FACC15', label: 'Storm Death' },
      ].map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)' }}>{label}</span>
        </div>
      ))}
      <div style={{ height: 1, background: 'var(--border-dim)', margin: '6px 0' }} />
      {[
        { line: `2px solid ${COLORS.humanPalette[0]}`, label: 'Human', dash: false },
        { line: `2px dashed ${COLORS.botPath}`, label: 'Bot', dash: true },
      ].map(({ line, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 20, height: 2, borderTop: line, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
