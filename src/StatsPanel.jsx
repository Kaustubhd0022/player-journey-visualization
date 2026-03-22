export default function StatsPanel({ events, selectedMatchId, matchDurationMs, playerTypeFilter }) {
  const kills = events.filter(e => e.event === 'Kill' || e.event === 'BotKill').length;
  const deaths = events.filter(e => e.event === 'Killed' || e.event === 'BotKilled' || e.event === 'KilledByStorm').length;
  const loot = events.filter(e => e.event === 'Loot').length;
  const storm = events.filter(e => e.event === 'KilledByStorm').length;

  const uniquePlayers = [...new Set(events.map(e => e.user_id))];
  const actualBotCount = uniquePlayers.filter(uid => strCheckIsBot(uid)).length;
  const actualHumanCount = uniquePlayers.length - actualBotCount;

  function strCheckIsBot(uid) {
    if (!uid) return false;
    return /^\d+$/.test(String(uid));
  }

  function formatDuration(ms) {
    if (typeof ms !== 'number' || isNaN(ms)) return '0M 0S';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}M ${s % 60}S`;
  }

  return (
    <div style={{
      background: 'var(--bg2)', borderTop: '1px solid var(--border-bright)',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: 16
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatBlock label="TOTAL KILLS" value={kills} color="var(--kill)" />
        <StatBlock label="STORM DEATHS" value={storm} color="var(--storm)" />
        <StatBlock label="ITEMS LOOTED" value={loot} color="var(--loot)" />
        <StatBlock label="DURATION" value={formatDuration(matchDurationMs)} color="var(--text-2)" />
      </div>

      <div style={{ height: 1, background: 'var(--border-dim)' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <label className="control-label" style={{ marginBottom: 4 }}>HUMAN / BOT SPLIT</label>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>
             {actualHumanCount} <span style={{ color: 'var(--text-4)', fontSize: 14 }}>/</span> {actualBotCount}
          </div>
        </div>
        {actualBotCount > (actualHumanCount + actualBotCount) * 0.8 && (
            <div style={{ 
                background: 'var(--death-glow)', border: '1px solid var(--death)', 
                color: 'var(--death)', fontSize: 9, padding: '2px 6px',
                fontFamily: 'var(--font-mono)', fontWeight: 700 
            }}>
                BOT-HEAVY MATCH
            </div>
        )}
      </div>
    </div>
  );
}

function StatBlock({ label, value, color }) {
  return (
    <div>
      <label className="control-label" style={{ marginBottom: 4, color: 'var(--text-4)' }}>{label}</label>
      <div style={{ 
        fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, 
        color: color || 'var(--text-0)', lineHeight: '1em'
      }}>
        {value}
      </div>
    </div>
  );
}
