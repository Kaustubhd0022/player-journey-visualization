import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import AxiomLogo from './AxiomLogo';
import { getAIContext, buildSystemPrompt, enrichPrompt, AI_TRIGGERS } from './axiomContext';
import { callAxiom } from './axiomAPI';

const AxiomPanel = forwardRef(function AxiomPanel({ appState, isOpen, onClose }, ref) {
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal]  = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const feedRef  = useRef(null);
  const convRef  = useRef([]);

  // Boot message on open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const ctx = getAIContext(appState);
      const map = ctx.currentView.map || 'the map';
      const boot = {
        id: 'boot', role: 'ai', trigger: 'BOOT',
        text: `AXIOM online. I'm reading ${ctx.dataSource}.\n\nCurrently tracking ${ctx.visibleData.kills} kill events, ${ctx.visibleData.stormDeaths} storm deaths, and ${ctx.visibleData.humanPlayers} human players on ${map}.\n\nTell me what to analyze — or hover over any event marker and I'll brief you automatically.`,
        timestamp: new Date(),
      };
      setMessages([boot]);
      convRef.current = [{ role: 'assistant', text: boot.text }];
    }
  }, [isOpen, messages.length, appState]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  const sendToAxiom = useCallback(async (userText, triggerLabel = null, isAutoTrigger = false) => {
    const ctx = getAIContext(appState);
    const systemPrompt = buildSystemPrompt(ctx);
    const enriched = enrichPrompt(userText, ctx);

    const userMsg = {
      id: Date.now(), role: 'user',
      text: isAutoTrigger ? null : userText,
      triggerLabel, timestamp: new Date(),
    };
    const aiId = Date.now() + 1;
    const aiMsg = {
      id: aiId, role: 'ai', triggerLabel,
      text: '', streaming: true, timestamp: new Date(),
    };

    setMessages(prev => [
      ...prev,
      ...(isAutoTrigger ? [] : [userMsg]),
      aiMsg,
    ]);

    convRef.current = [
      ...convRef.current,
      { role: 'user', text: enriched },
    ];

    setIsLoading(true);

    try {
      const finalText = await callAxiom(convRef.current, systemPrompt, (partial) => {
        setMessages(prev => prev.map(m => m.id === aiId ? { ...m, text: partial } : m));
      });
      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, streaming: false } : m));
      convRef.current = [...convRef.current, { role: 'assistant', text: finalText }];
      if (convRef.current.length > 40) convRef.current = convRef.current.slice(-40);
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === aiId ? { ...m, text: `Connection error: ${err.message}`, streaming: false, isError: true } : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [appState]);

  useImperativeHandle(ref, () => ({
    triggerAI: (triggerType, payload) => {
      if (!isOpen) return;
      
      const labels = {
        EVENT_HOVER:     `Analyzing event`,
        HEATMAP_CHANGE:  `${payload?.toUpperCase()} heatmap activated`,
        MATCH_SELECTED:  `Match loaded`,
        PLAYER_ISOLATED: `Tracking ${payload?.slice(-6) || 'player'}`,
        TIMELINE_PHASE:  `Entering ${payload} phase`,
      };
      
      const prompt = AI_TRIGGERS[triggerType]?.(payload, getAIContext(appState));
      if (prompt) {
        sendToAxiom(prompt, labels[triggerType], true);
      }
    },
    sendMessage: (text) => {
      sendToAxiom(text, null, false);
    },
    clearChat: () => {
        setMessages([]);
        convRef.current = [];
    }
  }));

  const handleSend = () => {
    if (!inputVal.trim() || isLoading) return;
    const q = inputVal.trim();
    setInputVal('');
    sendToAxiom(q);
  };

  const ctx = getAIContext(appState);

  if (!isOpen) return null;

  return (
    <div style={{
      width: 300, background: '#090D14',
      borderLeft: '1px solid #1E2D42',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, height: '100%',
      position: 'relative', zIndex: 1000
    }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #1E2D42',
        background: '#050810', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AxiomLogo size={28} animated={true} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-.01em' }}>
                AX<span style={{ color: '#00C8FF' }}>IO</span>M
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#22C55E', letterSpacing: '.12em', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'axiomCorePulse 2s infinite' }}/>
                LIVE
              </span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#2A3F57', letterSpacing: '.1em' }}>
              DESIGN INTELLIGENCE
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setMessages([]); convRef.current = []; }} style={{
                background: 'transparent', border: '1px solid #1E2D42',
                color: '#4B6280', padding: '4px 8px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            }}>CLEAR</button>
            <button onClick={onClose} style={{
                background: 'transparent', border: '1px solid #1E2D42',
                color: '#4B6280', width: 24, height: 24,
                cursor: 'pointer', fontSize: 11, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
        </div>
      </div>

      {/* Context strip */}
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid #1E2D42',
        background: '#050810', flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#2A3F57', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          Currently Seeing
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {[
            { label: ctx.currentView.map, color: '#00C8FF' },
            { label: ctx.currentView.match === 'Full Day Aggregate' ? 'AGGREGATE' : ctx.currentView.match?.slice(-6), color: '#4B6280' },
            { label: ctx.currentView.playerFilter?.toUpperCase(), color: ctx.currentView.playerFilter === 'human' ? '#22C55E' : '#4B6280' },
            ctx.currentView.heatmapActive && { label: `${ctx.currentView.heatmapMode?.toUpperCase()} MAP`, color: ctx.currentView.heatmapMode === 'kill' ? '#3B82F6' : ctx.currentView.heatmapMode === 'death' ? '#EF4444' : '#22C55E' },
            appState.isUploadedData && { label: 'UPLOADED', color: '#F97316' },
          ].filter(Boolean).map((c, i) => (
            <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: c.color, background: `${c.color}15`, border: `1px solid ${c.color}30`, padding: '2px 6px' }}>
              {c.label}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          {[
            { val: ctx.visibleData.kills, label: 'kills', color: '#3B82F6' },
            { val: ctx.visibleData.stormDeaths, label: 'storm', color: '#FACC15' },
            { val: ctx.visibleData.humanPlayers, label: 'humans', color: '#22C55E' },
          ].map(s => (
            <div key={s.label}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: s.color }}>{s.val}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#2A3F57', marginLeft: 3 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick prompts */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid #1E2D42', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { text: 'Kill hotspots?', icon: '◈', color: '#3B82F6' },
            { text: 'Dead zones?', icon: '⬡', color: '#22C55E' },
            { text: 'Storm deaths?', icon: '◎', color: '#FACC15' },
            { text: 'Bot vs human?', icon: '◆', color: '#94A3B8' },
            { text: 'What to fix?', icon: '▲', color: '#00C8FF' },
          ].map(q => (
            <button key={q.text}
              onClick={() => { setInputVal(q.text); handleSend(); }}
              disabled={isLoading}
              style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
                color: q.color, background: `${q.color}0D`,
                border: `1px solid ${q.color}30`,
                padding: '4px 8px', cursor: 'pointer',
                transition: 'all .15s', letterSpacing: '.06em',
                opacity: isLoading ? 0.4 : 1,
              }}>
              {q.icon} {q.text}
            </button>
          ))}
        </div>
      </div>

      {/* Chat feed */}
      <div ref={feedRef} style={{
        flex: 1, overflowY: 'auto', padding: '14px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.triggerLabel && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#1E2D42', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, height: 1, background: '#1E2D42' }}/>
                <span style={{ color: '#2A3F57' }}>{msg.triggerLabel}</span>
                <div style={{ flex: 1, height: 1, background: '#1E2D42' }}/>
              </div>
            )}
            {msg.role === 'ai' && (
              <div>
                <div style={{
                  background: '#0D1320', border: '1px solid #1E2D42',
                  borderLeft: `2px solid ${msg.isError ? '#EF4444' : '#00C8FF'}`,
                  padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <AxiomLogo size={12} animated={msg.streaming} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#00C8FF', letterSpacing: '.1em' }}>
                      AXIOM
                    </span>
                    {msg.streaming && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#2A3F57', animation: 'axiomCorePulse 1s infinite' }}>
                        ANALYZING...
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-ui)', fontSize: 12,
                    color: msg.isError ? '#EF4444' : '#94A3B8',
                    lineHeight: 1.7, whiteSpace: 'pre-wrap',
                  }}>
                    {msg.text || <span style={{ color: '#1E2D42' }}>◈ ◈ ◈</span>}
                    {msg.streaming && <span style={{ color: '#00C8FF', animation: 'blink 1s infinite' }}>▋</span>}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#1E2D42', marginTop: 3, textAlign: 'right' }}>
                  {msg.timestamp?.toLocaleTimeString()}
                </div>
              </div>
            )}
            {msg.role === 'user' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  background: 'rgba(0,200,255,.06)',
                  border: '1px solid rgba(0,200,255,.2)',
                  borderRight: '2px solid #00C8FF',
                  padding: '8px 12px', maxWidth: '88%',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 12, color: '#E2E8F0', lineHeight: 1.6,
                }}>
                  {msg.text}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{
        borderTop: '1px solid #1E2D42', padding: '10px 12px',
        display: 'flex', gap: 8, flexShrink: 0, background: '#050810',
      }}>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Ask AXIOM..."
          disabled={isLoading}
          style={{
            flex: 1, background: '#090D14',
            border: '1px solid #1E2D42',
            borderBottom: inputVal ? '1px solid #00C8FF' : '1px solid #1E2D42',
            color: '#E2E8F0', fontSize: 12, padding: '8px 10px',
            fontFamily: 'var(--font-ui)', outline: 'none',
            transition: 'border-color .15s',
          }}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !inputVal.trim()}
          style={{
            background: isLoading ? 'transparent' : '#00C8FF',
            border: '1px solid #00C8FF',
            color: isLoading ? '#00C8FF' : '#000',
            width: 36, height: 36, cursor: isLoading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s',
            opacity: (!inputVal.trim() && !isLoading) ? 0.35 : 1,
          }}
        >{isLoading ? '◈' : '→'}</button>
      </div>

      <style>{`
        @keyframes axiomCorePulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes axiomPulse { 0%,100%{opacity:1;stroke-opacity:1} 50%{opacity:0.4;stroke-opacity:0.2} }
        @keyframes axiomCore { 0%,100%{r:2.5;opacity:1} 50%{r:4;opacity:0.6} }
      `}</style>
    </div>
  );
});

export default AxiomPanel;
