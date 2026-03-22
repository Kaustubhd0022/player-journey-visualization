import React, { useState } from 'react';

export default function CoordConfigScreen({ mapName, onApply }) {
  const [originX, setOriginX] = useState(-500);
  const [originZ, setOriginZ] = useState(-500);
  const [scale, setScale] = useState(1000);
  const [label, setLabel] = useState(mapName || 'Unknown Map');
  const [minimapUrl, setMinimapUrl] = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setMinimapUrl(url);
    }
  };

  const handleSubmit = () => {
    onApply({
      mapName: label,
      config: {
        origin_x: parseFloat(originX),
        origin_z: parseFloat(originZ),
        scale: parseFloat(scale)
      },
      minimapUrl
    });
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg2)', padding: 40, color: 'var(--text-1)'
    }}>
      <div style={{ maxWidth: 500, width: '100%', background: 'var(--bg1)', padding: 32, borderRadius: 12, border: '1px solid var(--border-dim)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8, color: 'var(--text-0)' }}>
          Configure Coordinate Mapping
        </h2>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--text-3)', marginBottom: 24 }}>
          Your data uses a map we don't recognize. Enter the world coordinate parameters from your game's README or documentation.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase' }}>Map Name</label>
            <input 
              value={label} onChange={e => setLabel(e.target.value)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border-dim)', color: 'var(--text-0)', padding: '8px 12px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase' }}>Origin X</label>
              <input 
                type="number" value={originX} onChange={e => setOriginX(e.target.value)}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border-dim)', color: 'var(--text-0)', padding: '8px 12px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase' }}>Origin Z</label>
              <input 
                type="number" value={originZ} onChange={e => setOriginZ(e.target.value)}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border-dim)', color: 'var(--text-0)', padding: '8px 12px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase' }}>Scale</label>
              <input 
                type="number" value={scale} onChange={e => setScale(e.target.value)}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border-dim)', color: 'var(--text-0)', padding: '8px 12px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase' }}>Minimap Image (1024×1024)</label>
            <input 
              type="file" accept="image/*" onChange={handleImageUpload}
              style={{ fontFamily: 'var(--font-ui)', fontSize: 12 }}
            />
            {minimapUrl && <div style={{ marginTop: 8, fontSize: 10, color: 'var(--accent)' }}>✓ Image selected</div>}
          </div>

          <button 
            onClick={handleSubmit}
            style={{
              marginTop: 12, background: 'var(--accent)', color: '#000', border: 'none',
              padding: '12px', borderRadius: 6, fontWeight: 700, fontFamily: 'var(--font-display)',
              cursor: 'pointer', fontSize: 16
            }}
          >Apply and Visualize</button>
        </div>
      </div>
    </div>
  );
}
