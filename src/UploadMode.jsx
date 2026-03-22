import React, { useState, useRef } from 'react';
import { processFiles } from './uploadProcessor';

export default function UploadMode({ onUploadComplete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState(0); // 0-6
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const fileInputRef = useRef(null);

  const steps = [
    "Initializing parser...",
    "Reading files...",
    "Decoding events...",
    "Mapping coordinates...",
    "Computing heatmaps...",
    "Ready"
  ];

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFiles(files);
  };

  const handleFiles = async (files) => {
    const validFiles = files.filter(f => f.name.endsWith('.parquet') || f.name.endsWith('.zip'));
    if (validFiles.length === 0) {
      setError("Please upload .parquet or .zip files containing parquet data.");
      return;
    }

    const largeFile = validFiles.find(f => f.size > 50 * 1024 * 1024);
    if (largeFile) {
      setWarnings(prev => [...prev, "Large file detected — processing may take 30–60 seconds"]);
    }

    setProcessing(true);
    setError(null);
    setWarnings([]);
    setProgressStep(1);

    try {
      const result = await processFiles(validFiles, (step, msg) => {
        setProgressStep(step);
        setStatusMessage(msg);
      });
      
      if (result.warnings) setWarnings(result.warnings);
      setStatusMessage(`Ready — ${result.events.length.toLocaleString()} events loaded`);
      
      // Delay briefly to show completion
      setTimeout(() => {
        onUploadComplete(result);
      }, 800);

    } catch (err) {
      console.error(err);
      setError(err.message || "An error occurred during processing.");
      setProcessing(false);
    }
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg2)', padding: 40, overflowY: 'auto'
    }}>
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          width: '100%', maxWidth: 600, height: 300,
          border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border-dim)'}`,
          borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', background: 'var(--bg1)', transition: 'all .2s',
          cursor: processing ? 'default' : 'pointer', position: 'relative'
        }}
        onClick={() => !processing && fileInputRef.current?.click()}
      >
        <input 
          type="file" multiple accept=".parquet,.zip,.nakama-0" 
          style={{ display: 'none' }} 
          ref={fileInputRef}
          onChange={(e) => handleFiles(Array.from(e.target.files))}
        />
        
        {processing ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: progressStep >= s ? 'var(--accent)' : 'var(--bg3)',
                  boxShadow: progressStep === s ? '0 0 10px var(--accent)' : 'none',
                  animation: progressStep === s ? 'pulse 1.5s infinite' : 'none'
                }} />
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-0)', marginBottom: 8 }}>
              {steps[progressStep - 1]}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>
              {statusMessage}
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-0)', marginBottom: 8 }}>
              Upload Player Data
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-3)', marginBottom: 24, textAlign: 'center', lineHeight: 1.5 }}>
              Drag and drop <strong>.parquet</strong>, <strong>.zip</strong>, or <strong>.nakama-0</strong> files here<br/>
              or click to browse your computer
            </div>
            <button style={{
              background: 'var(--bg4)', color: 'var(--text-0)', border: '1px solid var(--border-bright)',
              padding: '10px 24px', borderRadius: 6, fontFamily: 'var(--font-ui)', fontWeight: 600,
              cursor: 'pointer'
            }}>Browse Files</button>
          </>
        )}
      </div>

      {error && (
        <div style={{
          marginTop: 16, width: '100%', maxWidth: 560,
          background: 'rgba(239,68,68,.08)',
          border: '1px solid var(--death)',
          padding: '16px 20px', borderRadius: 6
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--death)', letterSpacing: '.1em',
            textTransform: 'uppercase', marginBottom: 8,
          }}>Upload Failed</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            color: 'var(--text-2)', lineHeight: 1.7,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{error}</div>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Check browser console (F12) for the full list of files found in your ZIP.
          </div>
          <button
            onClick={() => { setError(null); setProcessing(false); }}
            style={{
              marginTop: 12,
              fontFamily: 'var(--font-condensed)', fontSize: 11,
              fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase',
              padding: '8px 16px', background: 'transparent',
              border: '1px solid var(--death)', color: 'var(--death)', cursor: 'pointer',
            }}
          >Try Again</button>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ 
          marginTop: 16, padding: '12px 20px', background: 'rgba(250, 204, 21, 0.1)', 
          border: '1px solid var(--storm)', borderRadius: 6, color: 'var(--storm)',
          fontFamily: 'var(--font-ui)', maxWidth: 600, fontSize: 13
        }}>
          <strong>Notes:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Schema Info */}
      <div style={{ marginTop: 40, width: '100%', maxWidth: 600 }}>
        <div style={{ 
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', 
          textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16,
          textAlign: 'center'
        }}>Expected Parquet Schema</div>
        <div style={{ 
          background: 'var(--bg3)', border: '1px solid var(--border-dim)', 
          borderRadius: 8, padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12
        }}>
          {[
            { n: 'match_id', t: 'string' },
            { n: 'user_id', t: 'string' },
            { n: 'ts', t: 'int64' },
            { n: 'event', t: 'bytes/string' },
            { n: 'x', t: 'float' },
            { n: 'z', t: 'float' },
            { n: 'map', t: 'string (opt)' },
          ].map(f => (
            <div key={f.n} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-dim)', paddingBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 13 }}>{f.n}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-4)', fontSize: 11 }}>{f.t}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
