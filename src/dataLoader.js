const BASE = '/static';

export async function loadIndex() {
  const res = await fetch(`${BASE}/index.json`);
  return res.json();
}

// Add this temporarily to your data loader to verify JSON integrity
async function verifyJsonFile(filename) {
  const res = await fetch(`${BASE}/${filename}`);
  const data = await res.json();
  
  console.group(`JSON VERIFICATION: ${filename}`);
  console.log('Total events in file:', data.events?.length ?? 'MISSING');
  console.log('Matches:', data.matches?.length, data.matches?.slice(0, 3));
  console.log('Map:', data.map);
  console.log('Date:', data.date);
  
  if (data.events?.length > 0) {
    const sample = data.events[0];
    console.log('Sample event:', sample);
    console.log('Fields present:', Object.keys(sample));
    
    const eventTypes = {};
    data.events.forEach(e => { eventTypes[e.event] = (eventTypes[e.event]||0)+1; });
    console.log('Event breakdown:', eventTypes);
    
    const withPx = data.events.filter(e => e.px != null && e.py != null).length;
    console.log('Events with pixel coords:', withPx, '/', data.events.length);
    
    const humans = new Set(data.events.filter(e=>e.player_type==='human').map(e=>e.user_id)).size;
    const bots   = new Set(data.events.filter(e=>e.player_type==='bot').map(e=>e.user_id)).size;
    console.log('Unique humans:', humans, '| Unique bots:', bots);
  } else {
    console.error('CRITICAL: events array is empty or missing');
  }
  console.groupEnd();
  return data;
}

export async function loadEvents(filename) {
  const res = await fetch(`${BASE}/${filename}`);
  const data = await res.json();
  await verifyJsonFile(filename); // remove after confirming data is correct
  return data;
}

export async function loadHeatmaps(filename) {
  const res = await fetch(`${BASE}/${filename}`);
  return res.json();
}
