import { useState, useEffect } from 'react';

const AXIOM_SUGGESTIONS = [
  {
    icon: "◈",
    color: "#3B82F6",
    text: "Where are the most kills happening?",
    sub: "I'll find your kill hotspots instantly"
  },
  {
    icon: "◎",
    color: "#EF4444",
    text: "Why are players dying to the storm here?",
    sub: "I'll analyze your storm death clusters"
  },
  {
    icon: "⬡",
    color: "#22C55E",
    text: "Which areas are players ignoring?",
    sub: "I'll identify dead zones on this map"
  },
  {
    icon: "◆",
    color: "#FACC15",
    text: "Show me how bots vs humans move differently",
    sub: "I'll compare their behavioral patterns"
  },
  {
    icon: "▲",
    color: "#00C8FF",
    text: "What should I fix on this map first?",
    sub: "I'll prioritize your design issues"
  },
  {
    icon: "◉",
    color: "#A78BFA",
    text: "Analyze my uploaded match data",
    sub: "I'll interpret your custom telemetry"
  },
  {
    icon: "⬢",
    color: "#F97316",
    text: "Where does the late game break down?",
    sub: "I'll trace the end-game flow patterns"
  },
];

export default function AxiomSuggestionPopup({ onSelect, onDismiss }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(show);
  }, []);

  useEffect(() => {
    const cycle = setInterval(() => {
      setIdx(i => (i + 1) % AXIOM_SUGGESTIONS.length);
    }, 8000);
    return () => clearInterval(cycle);
  }, []);

  if (!visible) return null;

  const s = AXIOM_SUGGESTIONS[idx];

  return (
    <div style={{
      position: 'absolute', top: 56, right: 12, zIndex: 200,
      background: '#090D14', border: '1px solid #243550',
      borderTop: `2px solid ${s.color}`,
      padding: '12px 14px', width: 240,
      animation: 'axiomSlideDown 0.2s ease-out',
      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ color: s.color, fontSize: 16, flexShrink: 0, lineHeight: 1.3 }}>{s.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Barlow',sans-serif", fontSize: 12,
            color: '#E2E8F0', lineHeight: 1.5, marginBottom: 3, cursor: 'pointer',
          }}
            onClick={() => { onSelect(s.text); onDismiss(); }}
          >{s.text}</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#4B6280', letterSpacing: '.05em' }}>
            {s.sub}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {AXIOM_SUGGESTIONS.map((_, i) => (
            <div key={i} style={{
              width: i === idx ? 12 : 4, height: 4, borderRadius: 2,
              background: i === idx ? s.color : '#1E2D42',
              transition: 'all .3s',
            }}/>
          ))}
        </div>
        <button onClick={onDismiss} style={{
          background: 'transparent', border: 'none',
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          color: '#2A3F57', cursor: 'pointer', letterSpacing: '.1em',
        }}>DISMISS</button>
      </div>
      <style>{`
        @keyframes axiomSlideDown {
          from { opacity:0; transform:translateY(-8px) }
          to { opacity:1; transform:translateY(0) }
        }
      `}</style>
    </div>
  );
}
