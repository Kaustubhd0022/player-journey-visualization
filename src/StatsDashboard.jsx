import { useEffect, useRef } from 'react';

function Panel({ title, sub, children }) {
  return (
    <div style={{ background:'#090D14', border:'1px solid #1E2D42', padding:'20px 24px' }}>
      <div style={{ marginBottom:4 }}>
        <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:18, fontWeight:600, color:'#fff', lineHeight:1 }}>{title}</div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57', letterSpacing:'.1em', marginTop:3 }}>{sub}</div>
      </div>
      <div style={{ height:'1px', background:'linear-gradient(90deg,#1E2D42,transparent)', margin:'12px 0' }}/>
      {children}
    </div>
  );
}

function KPIStrip({ stats }) {
  const s = stats.summary;
  const kpis = [
    { label:'Total Kills',    val: s.totalKills,        sub:`${s.humanKills} human`,       color:'#3B82F6' },
    { label:'Storm Deaths',   val: s.stormDeaths,       sub:`${s.stormDeathRate}% of deaths`, color:'#FACC15' },
    { label:'Survival Rate',  val:`${s.survivalRate}%`, sub:`${s.survivors} survived`,      color:'#22C55E' },
    { label:'Match Duration', val: s.durationLabel,     sub:`${s.matchCount} match(es)`,    color:'#00C8FF' },
    { label:'K / D',          val: s.kd,                sub:'Kills per death',              color:'#A78BFA' },
    { label:'Loot / Player',  val: s.lootPerPlayer,     sub:'Items per human',              color:'#F97316' },
    { label:'Avg Distance',   val:`${s.avgDistance.toLocaleString()}px`, sub:'Per human player', color:'#94A3B8' },
    { label:'Total Players',  val: s.humanPlayers + s.botPlayers, sub:`${s.botPlayers} bots`, color:'#4B6280' },
  ];

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:1, background:'#1E2D42' }}>
      {kpis.map(k => (
        <div key={k.label} style={{
          background:'#090D14', padding:'14px 16px',
          borderBottom:`2px solid ${k.color}`,
          position:'relative', overflow:'hidden',
        }}>
          <div style={{ position:'absolute', right:0, top:0, bottom:0, width:32, background:`linear-gradient(90deg,transparent,${k.color}0A)` }}/>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:6 }}>
            {k.label}
          </div>
          <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:26, fontWeight:700, color:k.color, lineHeight:1 }}>
            {k.val}
          </div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#4B6280', marginTop:4 }}>
            {k.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineChart({ data }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !data?.length || !window.Chart) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new window.Chart(ref.current, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [
          { label:'Kills',  data:data.map(d=>d.kills),  backgroundColor:'rgba(59,130,246,0.85)',  borderRadius:2, borderSkipped:false },
          { label:'Deaths', data:data.map(d=>d.deaths), backgroundColor:'rgba(239,68,68,0.85)',   borderRadius:2, borderSkipped:false },
          { label:'Storm',  data:data.map(d=>d.storm),  backgroundColor:'rgba(250,204,21,0.85)',  borderRadius:2, borderSkipped:false },
          { label:'Loot',   data:data.map(d=>d.loot),   backgroundColor:'rgba(34,197,94,0.35)',   borderRadius:2, borderSkipped:false },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: {
          legend:{ display:false },
          tooltip:{
            backgroundColor:'#090D14', borderColor:'#243550', borderWidth:1,
            titleColor:'#E2E8F0', bodyColor:'#94A3B8',
            titleFont:{ family:"'Rajdhani',sans-serif", size:14, weight:'600' },
            bodyFont:{ family:"'JetBrains Mono',monospace", size:11 },
            padding:10,
          },
        },
        scales:{
          x:{ stacked:false, grid:{ color:'#1E2D42' }, ticks:{ color:'#4B6280', font:{ family:"'JetBrains Mono',monospace", size:10 } } },
          y:{ grid:{ color:'#1E2D42' }, ticks:{ color:'#4B6280', font:{ family:"'JetBrains Mono',monospace", size:10 } }, beginAtZero:true },
        },
      },
    });
    return () => { if(chartRef.current) chartRef.current.destroy(); };
  }, [data]);

  return (
    <Panel title="Activity Timeline" sub="Events per match phase">
      <div style={{ display:'flex', gap:16, marginBottom:14 }}>
        {[['#3B82F6','Kills'],['#EF4444','Deaths'],['#FACC15','Storm'],['#22C55E','Loot']].map(([c,l])=>(
          <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:2, background:c }}/>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280' }}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{ height:220, position:'relative' }}><canvas ref={ref}/></div>
    </Panel>
  );
}

function QuadrantMap({ quadrants, killGrid }) {
  const total = Object.values(quadrants).reduce((a,b)=>a+b,0) || 1;
  const maxQ  = Math.max(...Object.values(quadrants));

  return (
    <Panel title="Kill Zone Distribution" sub="Map quadrant breakdown">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'#1E2D42', marginTop:8 }}>
        {['NW','NE','SW','SE'].map(zone => {
          const val = quadrants[zone] || 0;
          const pct = Math.round(val/total*100);
          const intensity = val/(maxQ||1);
          const isHottest = val === maxQ && val > 0;
          return (
            <div key={zone} style={{
              background:`rgba(59,130,246,${0.03 + intensity*0.22})`,
              padding:'18px 20px', position:'relative',
              borderLeft: isHottest ? '2px solid #3B82F6' : '2px solid transparent',
            }}>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280', marginBottom:4 }}>{zone}</div>
              <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:36, fontWeight:700, color: isHottest?'#3B82F6':'#E2E8F0', lineHeight:1 }}>
                {pct}<span style={{ fontSize:16, color:'#4B6280' }}>%</span>
              </div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280', marginTop:4 }}>{val} kills</div>
              {isHottest && (
                <div style={{ position:'absolute', top:8, right:8, fontFamily:"'JetBrains Mono',monospace", fontSize:8, color:'#3B82F6', background:'rgba(59,130,246,.12)', border:'1px solid rgba(59,130,246,.3)', padding:'2px 6px', letterSpacing:'.08em' }}>
                  HOTTEST
                </div>
              )}
              <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:'#3B82F6', opacity:intensity }}/>
            </div>
          );
        })}
      </div>
      {maxQ > 0 && (
        <div style={{ marginTop:12, fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#2A3F57', lineHeight:1.6 }}>
          {Object.entries(quadrants).sort((a,b)=>b[1]-a[1])[0][1] / total > 0.4
            ? '▲ Single zone dominance detected — possible choke point'
            : '◈ Kill distribution is relatively balanced across zones'}
        </div>
      )}
    </Panel>
  );
}

function PlayerTable({ players }) {
  return (
    <Panel title="Player Leaderboard" sub="Human players — sorted by kills">
      <div style={{ overflowX:'auto', marginTop:8 }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#050810' }}>
              {['#','Player ID','Kills','Deaths','K/D','Loot','Storm D','Distance','Status'].map(h => (
                <th key={h} style={{
                  fontFamily:"'JetBrains Mono',monospace", fontSize:9,
                  color:'#2A3F57', letterSpacing:'.12em', textTransform:'uppercase',
                  padding:'8px 12px', textAlign: h==='#'||h==='Kills'||h==='Deaths'||h==='K/D'||h==='Loot'||h==='Storm D'||h==='Distance'?'center':'left',
                  borderBottom:'1px solid #1E2D42', whiteSpace:'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr><td colSpan={9} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#2A3F57', padding:'20px 12px', textAlign:'center' }}>
                No human player data in current filter
              </td></tr>
            )}
            {players.map((p, i) => (
              <tr key={p.user_id} style={{ background: i%2===0?'#090D14':'#0D1320', transition:'background .1s' }}>
                <td style={{ padding:'10px 12px', textAlign:'center', fontFamily:"'Rajdhani',sans-serif", fontSize:16, fontWeight:700, color: i===0?'#3B82F6':i===1?'#94A3B8':i===2?'#F97316':'#2A3F57' }}>
                  {i+1}
                </td>
                <td style={{ padding:'10px 12px', fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#94A3B8', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {p.user_id.length > 16 ? p.user_id.slice(0,16)+'…' : p.user_id}
                </td>
                <td style={{ padding:'10px 12px', textAlign:'center' }}>
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:20, fontWeight:700, color:'#3B82F6' }}>{p.kills}</span>
                </td>
                <td style={{ padding:'10px 12px', textAlign:'center' }}>
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:20, fontWeight:700, color:'#EF4444' }}>{p.deaths}</span>
                </td>
                <td style={{ padding:'10px 12px', textAlign:'center' }}>
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:16, fontWeight:600, color:'#A78BFA' }}>{p.kd}</span>
                </td>
                <td style={{ padding:'10px 12px', textAlign:'center' }}>
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:16, fontWeight:600, color:'#22C55E' }}>{p.loot}</span>
                </td>
                <td style={{ padding:'10px 12px', textAlign:'center' }}>
                  <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:16, fontWeight:600, color:'#FACC15' }}>{p.stormDeaths}</span>
                </td>
                <td style={{ padding:'10px 12px', textAlign:'center' }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#4B6280' }}>{p.distance.toLocaleString()}</span>
                </td>
                <td style={{ padding:'10px 12px' }}>
                  <span style={{
                    fontFamily:"'JetBrains Mono',monospace", fontSize:9,
                    padding:'3px 8px', letterSpacing:'.08em',
                    color: p.alive?'#22C55E':'#EF4444',
                    background: p.alive?'rgba(34,197,94,.1)':'rgba(239,68,68,.1)',
                    border: `1px solid ${p.alive?'rgba(34,197,94,.3)':'rgba(239,68,68,.3)'}`,
                  }}>
                    {p.alive ? 'SURVIVED' : 'ELIMINATED'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function StormPanel({ storm, rate, summary }) {
  const total = storm.early + storm.mid + storm.late || 1;
  const phases = [
    { label:'Early game', val:storm.early, color:'#22C55E', pct:Math.round(storm.early/total*100) },
    { label:'Mid game',   val:storm.mid,   color:'#FACC15', pct:Math.round(storm.mid/total*100)   },
    { label:'Late game',  val:storm.late,  color:'#EF4444', pct:Math.round(storm.late/total*100)  },
  ];

  const severity = rate > 30 ? { label:'CRITICAL', color:'#EF4444' } : rate > 15 ? { label:'ELEVATED', color:'#FACC15' } : { label:'NOMINAL', color:'#22C55E' };

  return (
    <Panel title="Storm Death Analysis" sub="When and how much storm kills">
      <div style={{ display:'flex', alignItems:'flex-start', gap:20, marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:64, fontWeight:700, color:'#FACC15', lineHeight:1 }}>{rate}%</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280' }}>of all deaths</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280', marginTop:2 }}>caused by storm</div>
        </div>
        <div style={{ paddingTop:8 }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57', letterSpacing:'.12em', marginBottom:4 }}>SEVERITY</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:700, color:severity.color, letterSpacing:'.08em' }}>{severity.label}</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#4B6280', marginTop:8, lineHeight:1.5 }}>
            {summary.stormDeaths} total<br/>storm deaths
          </div>
        </div>
      </div>

      {phases.map(ph => (
        <div key={ph.label} style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280' }}>{ph.label}</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:16, fontWeight:700, color:ph.color }}>{ph.val}</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57' }}>{ph.pct}%</span>
            </div>
          </div>
          <div style={{ height:8, background:'#1E2D42', borderRadius:1, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${ph.pct}%`, background:ph.color, borderRadius:1, transition:'width .5s' }}/>
          </div>
        </div>
      ))}

      {storm.late > total * 0.6 && (
        <div style={{ marginTop:12, background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.2)', padding:'10px 12px', fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#EF4444', lineHeight:1.7 }}>
          ▲ Late-game storm deaths dominant — players getting caught in final-circle bottlenecks. Check storm rotation paths for geometric traps.
        </div>
      )}
    </Panel>
  );
}

function BotHumanPanel({ data, summary }) {
  const rows = [
    { metric:'Avg Kills/Player',   human:(data.humanKills/Math.max(summary.humanPlayers,1)).toFixed(1), bot:(data.botKills/Math.max(summary.botPlayers,1)).toFixed(1),   hColor:'#3B82F6', bColor:'#4B6280' },
    { metric:'Storm Deaths/Player',human:(data.humanStorm/Math.max(summary.humanPlayers,1)).toFixed(2), bot:(data.botStorm/Math.max(summary.botPlayers,1)).toFixed(2),   hColor:'#FACC15', bColor:'#4B6280' },
    { metric:'Avg Loot/Player',    human:data.humanLoot,                                                bot:data.botLoot,                                                hColor:'#22C55E', bColor:'#4B6280' },
    { metric:'Total Players',      human:summary.humanPlayers,                                          bot:summary.botPlayers,                                          hColor:'#00C8FF', bColor:'#4B6280' },
  ];

  return (
    <Panel title="Human vs Bot" sub="Behavioral comparison">
      <div style={{ marginTop:8 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 72px 72px', gap:1, background:'#1E2D42' }}>
          {['Metric','Human','Bot'].map(h => (
            <div key={h} style={{ background:'#050810', padding:'8px 10px', fontFamily:"'JetBrains Mono',monospace", fontSize:9, color: h==='Human'?'#22C55E':h==='Bot'?'#4B6280':'#2A3F57', letterSpacing:'.1em', textAlign:h==='Metric'?'left':'center' }}>
              {h}
            </div>
          ))}
          {rows.map((r,i) => (
            <>
              <div key={`l${i}`} style={{ background:i%2===0?'#090D14':'#0D1320', padding:'10px 10px', fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#94A3B8', lineHeight:1.3 }}>{r.metric}</div>
              <div key={`h${i}`} style={{ background:i%2===0?'#090D14':'#0D1320', padding:'10px 8px', fontFamily:"'Rajdhani',sans-serif", fontSize:20, fontWeight:700, color:r.hColor, textAlign:'center' }}>{r.human}</div>
              <div key={`b${i}`} style={{ background:i%2===0?'#090D14':'#0D1320', padding:'10px 8px', fontFamily:"'Rajdhani',sans-serif", fontSize:20, fontWeight:700, color:r.bColor, textAlign:'center' }}>{r.bot}</div>
            </>
          ))}
        </div>
        <div style={{ marginTop:12, fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#2A3F57', lineHeight:1.7 }}>
          Switch to Human filter on the Map tab for design-relevant heatmaps. Bot paths follow scripted routes and should not inform spatial decisions.
        </div>
      </div>
    </Panel>
  );
}

function LootPanel({ summary, lootGrid }) {
  const maxCell = Math.max(...lootGrid.flat(), 1);

  return (
    <Panel title="Loot Distribution" sub="Item pickup density across map">
      <div style={{ display:'flex', gap:16, marginBottom:14, marginTop:8 }}>
        <div>
          <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:36, fontWeight:700, color:'#22C55E', lineHeight:1 }}>{summary.totalLoot.toLocaleString()}</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#4B6280' }}>total pickups</div>
        </div>
        <div style={{ borderLeft:'1px solid #1E2D42', paddingLeft:16 }}>
          <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:36, fontWeight:700, color:'#22C55E', lineHeight:1 }}>{summary.lootPerPlayer}</div>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#4B6280' }}>per human player</div>
        </div>
      </div>

      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57', letterSpacing:'.12em', marginBottom:8 }}>LOOT GRID (8×8 MAP CELLS)</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:2 }}>
        {lootGrid.map((row, ry) =>
          row.map((val, cx) => {
            const intensity = val / maxCell;
            return (
              <div key={`${ry}-${cx}`} title={`Cell (${cx},${ry}): ${val} loot events`} style={{
                height:24, borderRadius:1,
                background: val === 0 ? '#0D1320' : `rgba(34,197,94,${0.1 + intensity*0.85})`,
                border: val === maxCell && val > 0 ? '1px solid #22C55E' : '1px solid transparent',
                transition:'all .2s', cursor:'default',
              }}/>
            );
          })
        )}
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57' }}>
        <span>Low density</span><span style={{ color:'#22C55E' }}>High density</span>
      </div>

      {parseFloat(summary.lootPerPlayer) < 3 && (
        <div style={{ marginTop:12, background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.2)', padding:'8px 10px', fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#EF4444', lineHeight:1.6 }}>
          ▲ Low loot per player — insufficient loot density or players dying before looting
        </div>
      )}
    </Panel>
  );
}

function DistancePanel({ players, avg }) {
  const top = players.slice(0, 8);
  const maxD = Math.max(...top.map(p=>p.distance), 1);

  return (
    <Panel title="Movement Distance" sub="Total path length per human player">
      <div style={{ display:'flex', alignItems:'baseline', gap:8, margin:'10px 0 16px' }}>
        <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:36, fontWeight:700, color:'#00C8FF', lineHeight:1 }}>{avg.toLocaleString()}</span>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280' }}>avg px</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {top.map((p, i) => (
          <div key={p.user_id}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color: i===0?'#00C8FF':'#94A3B8', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {p.user_id.length > 14 ? p.user_id.slice(0,14)+'…' : p.user_id}
              </span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280' }}>{p.distance.toLocaleString()}</span>
            </div>
            <div style={{ height:5, background:'#1E2D42', borderRadius:1, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(p.distance/maxD)*100}%`, background: i===0?'#00C8FF':'#243550', borderRadius:1, transition:'width .5s' }}/>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function KillDensityGrid({ grid }) {
  const flat = grid.flat();
  const maxVal = Math.max(...flat, 1);
  const total  = flat.reduce((a,b)=>a+b,0);

  return (
    <Panel title="Kill Density Grid" sub="8×8 spatial breakdown — each cell = 128×128px map area">
      <div style={{ display:'flex', gap:24, alignItems:'flex-start', marginTop:8 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:3, maxWidth:480 }}>
            {grid.map((row, ry) =>
              row.map((val, cx) => {
                const intensity = val / maxVal;
                const isHot = val === maxVal && val > 0;
                return (
                  <div key={`${ry}-${cx}`} title={`Zone (${cx},${ry}): ${val} kills (${total>0?Math.round(val/total*100):0}%)`} style={{
                    height:40, borderRadius:1, position:'relative',
                    background: val===0 ? '#0D1320' : `rgba(59,130,246,${0.08+intensity*0.87})`,
                    border: isHot ? '1px solid #3B82F6' : '1px solid transparent',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    cursor:'default', transition:'all .2s',
                  }}>
                    {val > 0 && (
                      <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize: val>99?10:12, fontWeight:700, color: intensity>0.5?'#fff':'rgba(255,255,255,0.6)' }}>
                        {val}
                      </span>
                    )}
                    {isHot && (
                      <div style={{ position:'absolute', inset:0, border:'1px solid #3B82F6', borderRadius:1, pointerEvents:'none' }}/>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57' }}>No activity</span>
            <div style={{ display:'flex', gap:2 }}>
              {[0.1,0.25,0.45,0.65,0.85,1.0].map(v=>(
                <div key={v} style={{ width:16, height:8, borderRadius:1, background:`rgba(59,130,246,${0.08+v*0.87})` }}/>
              ))}
            </div>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#3B82F6' }}>High kills</span>
          </div>
        </div>

        <div style={{ width:200 }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Top Kill Zones</div>
          {flat
            .map((val,idx)=>({ val, row:Math.floor(idx/8), col:idx%8 }))
            .filter(c=>c.val>0)
            .sort((a,b)=>b.val-a.val)
            .slice(0,5)
            .map((c,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#E2E8F0' }}>
                    Zone ({c.col},{c.row})
                  </div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#4B6280' }}>
                    {total>0?Math.round(c.val/total*100):0}% of kills
                  </div>
                </div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:22, fontWeight:700, color: i===0?'#3B82F6':'#94A3B8' }}>
                  {c.val}
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </Panel>
  );
}

function DeadZoneReport({ deadZones, totalMatches }) {
  const dead     = deadZones.filter(z => z.severity === 'dead');
  const underused = deadZones.filter(z => z.severity === 'underused');
  const wastedPct = Math.round(deadZones.length / 64 * 100);

  return (
    <Panel title="Dead Zone Report" sub="Map areas with near-zero human player activity">

      {/* Summary row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:'#1E2D42', margin:'12px 0 20px' }}>
        {[
          { label:'Dead Zones',        val:dead.length,      sub:'0–20% match visits', color:'#EF4444' },
          { label:'Underused Zones',   val:underused.length, sub:'20–40% match visits', color:'#FACC15' },
          { label:'Wasted Map Area',   val:`${wastedPct}%`,  sub:'of total map grid',   color:'#F97316' },
        ].map(k => (
          <div key={k.label} style={{ background:'#090D14', padding:'14px 16px', borderTop:`2px solid ${k.color}` }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:6 }}>{k.label}</div>
            <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:28, fontWeight:700, color:k.color, lineHeight:1 }}>{k.val}</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#4B6280', marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {deadZones.length === 0 && (
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#22C55E', padding:'16px 0', textAlign:'center' }}>
          ◈ No significant dead zones detected — good map utilization
        </div>
      )}

      {/* Dead zones table */}
      {deadZones.length > 0 && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#050810' }}>
                {['Zone','Area','Events','Match Visits','Visit Rate','Status','Action'].map(h => (
                  <th key={h} style={{
                    fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57',
                    letterSpacing:'.12em', textTransform:'uppercase',
                    padding:'8px 12px', textAlign:'left',
                    borderBottom:'1px solid #1E2D42', whiteSpace:'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deadZones.map((z, i) => (
                <tr key={z.key} style={{ background: i%2===0?'#090D14':'#0D1320' }}>
                  <td style={{ padding:'10px 12px', fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#E2E8F0' }}>
                    {z.label}
                  </td>
                  <td style={{ padding:'10px 12px', fontFamily:"'Barlow',sans-serif", fontSize:12, color:'#94A3B8' }}>
                    {z.area}
                  </td>
                  <td style={{ padding:'10px 12px', fontFamily:"'Rajdhani',sans-serif", fontSize:18, fontWeight:700, color: z.totalEvents===0?'#EF4444':'#94A3B8' }}>
                    {z.totalEvents}
                  </td>
                  <td style={{ padding:'10px 12px', fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#4B6280' }}>
                    {z.matchVisits} / {totalMatches}
                  </td>
                  <td style={{ padding:'10px 12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ flex:1, height:6, background:'#1E2D42', borderRadius:1, overflow:'hidden', minWidth:60 }}>
                        <div style={{ height:'100%', width:`${z.visitRate}%`, background: z.visitRate<20?'#EF4444':'#FACC15', borderRadius:1 }}/>
                      </div>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color: z.visitRate<20?'#EF4444':'#FACC15', minWidth:32 }}>
                        {z.visitRate}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{
                      fontFamily:"'JetBrains Mono',monospace", fontSize:9, padding:'3px 8px',
                      letterSpacing:'.08em',
                      color: z.severity==='dead'?'#EF4444':'#FACC15',
                      background: z.severity==='dead'?'rgba(239,68,68,.1)':'rgba(250,204,21,.1)',
                      border: `1px solid ${z.severity==='dead'?'rgba(239,68,68,.3)':'rgba(250,204,21,.3)'}`,
                    }}>
                      {z.severity === 'dead' ? 'DEAD ZONE' : 'UNDERUSED'}
                    </span>
                  </td>
                  <td style={{ padding:'10px 12px', fontFamily:"'Barlow',sans-serif", fontSize:11, color:'#4B6280', lineHeight:1.5 }}>
                    {z.totalEvents === 0
                      ? 'Add loot or objective to attract players'
                      : z.visitRate < 10
                      ? 'Improve access routes'
                      : 'Increase loot density'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {wastedPct > 25 && (
        <div style={{ marginTop:16, background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.2)', padding:'12px 16px', fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#EF4444', lineHeight:1.7 }}>
          ▲ {wastedPct}% of the map is functionally invisible to players. This is above the 25% threshold — significant design investment is going to waste. Priority: add loot incentives and access routes to the top dead zones listed above.
        </div>
      )}
    </Panel>
  );
}

function LandingZonePanel({ topLandingZones, totalLandings }) {
  if (!topLandingZones || topLandingZones.length === 0) return null;

  const top3 = topLandingZones.slice(0, 3);
  const dominated = top3[0]?.pct > 30;

  return (
    <Panel title="Landing Zone Analysis" sub="Where players first touch ground — determines all downstream behavior">

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, margin:'12px 0 16px' }}>
        {top3.map((z, i) => (
          <div key={z.zone} style={{
            background: i===0?'rgba(0,200,255,.06)':'#0D1320',
            border: `1px solid ${i===0?'rgba(0,200,255,.3)':'#1E2D42'}`,
            padding:'14px 16px',
            borderTop: `2px solid ${i===0?'#00C8FF':i===1?'#A78BFA':'#4B6280'}`,
          }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57', letterSpacing:'.1em', marginBottom:6 }}>
              {i===0?'PRIMARY LZ':i===1?'SECONDARY LZ':'TERTIARY LZ'}
            </div>
            <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:32, fontWeight:700, color:i===0?'#00C8FF':i===1?'#A78BFA':'#4B6280', lineHeight:1 }}>
              {z.pct}%
            </div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280', marginTop:4 }}>
              {z.count} of {totalLandings} drops
            </div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57', marginTop:4 }}>
              Cell ({z.cx},{z.cy})
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom:12 }}>
        {topLandingZones.slice(0,8).map((z, i) => (
          <div key={z.zone} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#4B6280', minWidth:80 }}>
              ({z.cx},{z.cy})
            </span>
            <div style={{ flex:1, height:6, background:'#1E2D42', borderRadius:1, overflow:'hidden' }}>
              <div style={{
                height:'100%',
                width:`${(z.pct/(topLandingZones[0].pct||1))*100}%`,
                background: i===0?'#00C8FF':i<3?'#A78BFA':'#243550',
                borderRadius:1, transition:'width .5s',
              }}/>
            </div>
            <span style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:16, fontWeight:700, color:i===0?'#00C8FF':'#4B6280', minWidth:36, textAlign:'right' }}>
              {z.pct}%
            </span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'#2A3F57', minWidth:50 }}>
              {z.count} drops
            </span>
          </div>
        ))}
      </div>

      {dominated && (
        <div style={{ background:'rgba(250,204,21,.07)', border:'1px solid rgba(250,204,21,.2)', padding:'10px 14px', fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#FACC15', lineHeight:1.7 }}>
          ▲ {top3[0].pct}% of players land in one zone — high loot pressure and early fight concentration. Consider redistributing high-tier loot across 2–3 zones to diversify drop patterns.
        </div>
      )}

      {!dominated && top3.length >= 3 && (
        <div style={{ background:'rgba(34,197,94,.07)', border:'1px solid rgba(34,197,94,.2)', padding:'10px 14px', fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#22C55E', lineHeight:1.7 }}>
          ◈ Landing zones are well distributed — players are spreading across multiple areas. Healthy sign for map diversity.
        </div>
      )}
    </Panel>
  );
}


export default function StatsDashboard({ stats, landingEvents, topLandingZones, deadZones }) {
  if (!stats) {
    return (
      <div style={{
        flex:1, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        background:'#050810', gap:16,
      }}>
        <div style={{ fontSize:32, color:'#1E2D42' }}>▦</div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:'#2A3F57', letterSpacing:'.15em' }}>
          SELECT A MAP AND DATE TO VIEW STATISTICS
        </div>
        <div style={{ fontFamily:"'Barlow',sans-serif", fontSize:13, color:'#4B6280' }}>
          Use the filter panel on the left to load data
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex:1, overflowY:'auto', background:'#050810',
      padding:'28px 32px', display:'flex', flexDirection:'column', gap:28,
    }}>
      {/* Row 1 — KPI strip */}
      <KPIStrip stats={stats} />

      {/* Row 2 — Timeline + Quadrant map */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:20 }}>
        <TimelineChart data={stats.timeline} />
        <QuadrantMap quadrants={stats.quadrants} killGrid={stats.killGrid} />
      </div>

      {/* Row 3 — Player table + Storm analysis */}
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:20 }}>
        <PlayerTable players={stats.playerStats} />
        <StormPanel storm={stats.stormPhases} rate={stats.summary.stormDeathRate} summary={stats.summary} />
      </div>

      {/* Row 4 — Bot vs Human + Loot + Distance */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20 }}>
        <BotHumanPanel data={stats.botVsHuman} summary={stats.summary} />
        <LootPanel summary={stats.summary} lootGrid={stats.lootGrid} />
        <DistancePanel players={stats.playerStats} avg={stats.summary.avgDistance} />
      </div>
      
      {/* Row 5 — Landing Zone + Kill Density */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr', gap:20 }}>
        <LandingZonePanel
          topLandingZones={topLandingZones}
          totalLandings={landingEvents?.length || 0}
        />
        <KillDensityGrid grid={stats.killGrid} />
      </div>
      
      {/* Row 6 — Dead zone full width */}
      <DeadZoneReport
        deadZones={deadZones}
        totalMatches={stats.summary.matchCount}
      />
    </div>
  );
}
