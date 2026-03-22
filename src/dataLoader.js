const BASE = '/static';

export async function loadIndex() {
  const res = await fetch(`${BASE}/index.json`);
  return res.json();
}

export async function loadEvents(filename) {
  const res = await fetch(`${BASE}/${filename}`);
  return res.json();
}

export async function loadHeatmaps(filename) {
  const res = await fetch(`${BASE}/${filename}`);
  return res.json();
}
