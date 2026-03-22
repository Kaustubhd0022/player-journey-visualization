import { useRef } from 'react';

function msToDisplay(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `T+${m}:${ss}`;
}

export default function Timeline({ currentTimeMs, onScrub, matchDurationMs, isPlaying, onPlayPause, playbackSpeed, onSpeedChange, disabled }) {
  const pct = matchDurationMs > 0 ? (currentTimeMs / matchDurationMs) * 100 : 0;

  return (
    <div style={{
      height: 72, background: 'var(--bg2)', borderTop: '1px solid var(--border-dim)',
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0,
      opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto',
      position: 'relative', zIndex: 100
    }}>
      {/* Play / Pause */}
      <button onClick={onPlayPause} style={{
        width: 36, height: 36, background: 'var(--accent)', border: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        borderRadius: 2
      }}>
        {isPlaying
          ? <div style={{ display: 'flex', gap: 3 }}><div style={{ width: 3, height: 14, background: '#000' }} /><div style={{ width: 3, height: 14, background: '#000' }} /></div>
          : <div style={{ width: 0, height: 0, borderLeft: '12px solid #000', borderTop: '7px solid transparent', borderBottom: '7px solid transparent', marginLeft: 2 }} />
        }
      </button>

      {/* Current time */}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', minWidth: 58, flexShrink: 0 }}>
        {msToDisplay(currentTimeMs)}
      </span>

      {/* Track */}
      <div
        style={{ flex: 1, height: 4, background: 'var(--bg4)', borderRadius: 2, position: 'relative', cursor: 'pointer' }}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          onScrub(ratio * matchDurationMs);
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width .05s linear' }} />
        <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: '#fff', border: '2px solid var(--accent)', cursor: 'grab', transition: 'left .05s linear' }} />
      </div>

      {/* Speed */}
      <div style={{ display: 'flex', gap: 1, background: 'var(--border-dim)' }}>
        {[1, 2, 4].map(s => (
            <button key={s} onClick={() => onSpeedChange(s)} style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px',
            background: playbackSpeed === s ? 'var(--accent)' : 'var(--bg3)',
            border: 'none',
            color: playbackSpeed === s ? '#000' : 'var(--text-3)', cursor: 'pointer',
            fontWeight: 600
            }}>{s}×</button>
        ))}
      </div>

      {/* End time */}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', minWidth: 58, textAlign: 'right', flexShrink: 0 }}>
        {msToDisplay(matchDurationMs)}
      </span>

      {disabled && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)', color: 'var(--text-2)',
          fontSize: 12, fontWeight: 500, pointerEvents: 'none'
        }}>
          Select a match ID for timeline playback
        </div>
      )}
    </div>
  );
}
