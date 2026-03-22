export default function AxiomLogo({ size = 28, animated = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="14,2 26,8 26,20 14,26 2,20 2,8"
        stroke="#00C8FF" strokeWidth="1.5" fill="rgba(0,200,255,0.06)"
        style={animated ? { animation: 'axiomPulse 3s ease-in-out infinite' } : {}}
      />
      <polygon points="14,7 21,11 21,17 14,21 7,17 7,11"
        stroke="#00C8FF" strokeWidth="1" fill="rgba(0,200,255,0.1)"
        style={animated ? { animation: 'axiomPulse 3s ease-in-out infinite 0.5s' } : {}}
      />
      <circle cx="14" cy="14" r="2.5" fill="#00C8FF"
        style={animated ? { animation: 'axiomCore 2s ease-in-out infinite' } : {}}
      />
      <line x1="14" y1="7" x2="14" y2="11" stroke="#00C8FF" strokeWidth="1" opacity="0.6"/>
      <line x1="14" y1="17" x2="14" y2="21" stroke="#00C8FF" strokeWidth="1" opacity="0.6"/>
      <line x1="7" y1="11" x2="11" y2="13" stroke="#00C8FF" strokeWidth="1" opacity="0.6"/>
      <line x1="17" y1="15" x2="21" y2="17" stroke="#00C8FF" strokeWidth="1" opacity="0.6"/>
    </svg>
  );
}
