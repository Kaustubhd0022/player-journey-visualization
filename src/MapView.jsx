import { useEffect, useRef, useState, useCallback } from 'react';
import Plotly from 'plotly.js-dist';
import { COLORS, EVENTS, MINIMAP_SIZE } from './constants';
import { gridToBase64 } from './HeatmapRenderer';

const HUMAN_PALETTE = COLORS.humanPalette;

export default function MapView({ 
  selectedMap, events, showPaths, showMarkers, 
  showHeatmap, heatmapGrid, heatmapMode, 
  playerTypeFilter, loading, selectedMatchId, 
  showMapImage, customMapConfig, customMinimapUrl,
  onEventHover 
}) {
  const plotRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const [isolatedPlayer, setIsolatedPlayer] = useState(null);

  const getMinimapUrl = (map) => {
    if (customMinimapUrl) return customMinimapUrl;
    return `/static/minimaps/${map}.png`;
  };

  const buildTraces = useCallback(() => {
    const traces = [];

    // ── PATHS ──────────────────────────────────────────────────────────────
    if (showPaths) {
      const positionEvents = events.filter(e => e.event === 'Position' || e.event === 'BotPosition');
      const byPlayer = {};
      positionEvents.forEach(e => {
        if (!byPlayer[e.user_id]) byPlayer[e.user_id] = [];
        byPlayer[e.user_id].push(e);
      });

      const players = Object.entries(byPlayer);
      players.forEach(([uid, evts], i) => {
        const sorted = [...evts].sort((a, b) => a.ts - b.ts);
        const isBot = evts[0].player_type === 'bot';
        
        const pathOpacity = showMapImage ? (isBot ? 0.75 : 0.85) : 0.95;
        const opacity = isolatedPlayer ? (isolatedPlayer === uid ? 1 : 0.08) : pathOpacity;
        
        traces.push({
          type: 'scattergl', mode: 'lines',
          x: sorted.map(e => e.px), y: sorted.map(e => MINIMAP_SIZE - e.py),
          line: { 
            color: isBot ? COLORS.botPath : HUMAN_PALETTE[i % HUMAN_PALETTE.length], 
            width: 2,
            dash: isBot ? 'dash' : 'solid'
          },
          opacity,
          name: uid, hoverinfo: 'none',
          customdata: sorted.map(e => ({ user_id: uid, ...e })), // Pass full event data for hover
        });
      });
    }

    // ── MARKERS ────────────────────────────────────────────────────────────
    if (showMarkers) {
      const markerEvents = events.filter(e => EVENTS[e.event] && !e.event.includes('Position'));
      const byType = {};
      markerEvents.forEach(e => {
        if (!byType[e.event]) byType[e.event] = [];
        byType[e.event].push(e);
      });

      Object.entries(byType).forEach(([evtType, evts]) => {
        const cfg = EVENTS[evtType];
        if (!cfg) return;
        
        const markerOpacity = showMapImage ? 0.9 : 1.0;
        
        traces.push({
          type: 'scattergl', mode: 'markers',
          x: evts.map(e => e.px),
          y: evts.map(e => MINIMAP_SIZE - e.py),
          marker: {
            color: cfg.color,
            size: cfg.size,
            opacity: markerOpacity,
            symbol: 'circle',
          },
          text: evts.map(e => `<b>${cfg.label}</b><br>${e.user_id}<br>T+${Math.floor(e.ts/1000)}s`),
          hovertemplate: '%{text}<extra></extra>',
          name: cfg.label,
          customdata: evts // Pass event objects
        });
      });
    }

    return traces;
  }, [events, showPaths, showMarkers, isolatedPlayer, showMapImage]);

  useEffect(() => {
    if (!plotRef.current) return;

    const layout = {
      paper_bgcolor: '#050810',
      plot_bgcolor:  '#050810',
      xaxis: { range: [0, 1024], showgrid: false, zeroline: false, showticklabels: false, fixedrange: false },
      yaxis: { range: [0, 1024], showgrid: false, zeroline: false, showticklabels: false, fixedrange: false, scaleanchor: 'x', scaleratio: 1 },
      showlegend: false,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      dragmode: 'pan',
      images: showMapImage ? [{
        source: getMinimapUrl(selectedMap),
        xref: 'x', yref: 'y',
        x: 0, y: 1024,
        sizex: 1024, sizey: 1024,
        sizing: 'stretch', opacity: 1, layer: 'below',
      }] : [],
    };

    // Heatmap overlay
    if (showHeatmap && heatmapGrid) {
      const heatmapImg = gridToBase64(heatmapGrid, heatmapMode);
      layout.images.push({
        source: heatmapImg,
        xref: 'x', yref: 'y',
        x: 0, y: 1024,
        sizex: 1024, sizey: 1024,
        sizing: 'stretch', opacity: 0.7, layer: 'above',
      });
    }

    const config = {
      displayModeBar: false,
      scrollZoom: true,
      responsive: true,
    };

    Plotly.react(plotRef.current, buildTraces(), layout, config);

    // Events
    const handleRef = plotRef.current;
    
    const onClick = (data) => {
      const uid = data.points[0]?.data?.customdata?.[data.points[0].pointNumber]?.user_id || data.points[0]?.data?.customdata?.[0];
      if (uid && typeof uid === 'string') setIsolatedPlayer(uid === isolatedPlayer ? null : uid);
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
  }, [selectedMap, buildTraces, showHeatmap, heatmapGrid, heatmapMode, isolatedPlayer, showMapImage, onEventHover]);

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

      {/* Legend */}
      <Legend />

      {/* Isolated player indicator */}
      {isolatedPlayer && (
        <div style={{
          position: 'absolute', top: 16, left: 16, background: 'rgba(9,13,20,.92)',
          border: '1px solid var(--kill)', padding: '6px 12px', zIndex: 10,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--kill)',
        }}>
          ISOLATED: {isolatedPlayer} — <span style={{ color: 'var(--text-3)', cursor: 'pointer' }} onClick={() => setIsolatedPlayer(null)}>ESC to clear</span>
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
