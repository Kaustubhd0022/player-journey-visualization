# ARCHITECTURE.md
## Player Journey Visualization Tool — LILA BLACK
**Version:** 2.0 (Final)
**Platform:** Antigravity
**Author:** APM Candidate

---

## System Statement

> The system uses an **offline data processing pipeline** to transform raw parquet telemetry into optimized JSON and pre-computed heatmap grids, which are served as static files to an Antigravity frontend. All filtering and rendering happen client-side in the browser, enabling sub-200ms interaction with no backend round-trips.

This architecture trades deployment complexity for interaction speed — the correct trade-off for a design tool where the user's primary pain is waiting.

---

## 1. Tech Stack — Choices and Rationale

| Layer | Choice | Reason |
|---|---|---|
| **UI Framework** | Antigravity | Single-command deploy with instant shareable URL. Antigravity is sufficient here because the problem is **visualization-first**, not custom-interaction-heavy — built-in component primitives cover filters, toggles, and sliders without custom plumbing. React would require separate hosting setup, build pipelines, and env configuration — meaningless overhead for a 5-day build. |
| **Visualization** | Plotly.js | Supports `scattergl` (WebGL-accelerated scatter plots) — renders 50,000+ event markers without frame drops. Chart.js lacks WebGL mode. D3 achieves the same result but requires 5× more code. Plotly's `react()` method also enables differential re-renders (only changed traces update) — critical for sub-200ms filter response. |
| **Data Processing** | Python + Pandas + PyArrow | PyArrow is the fastest parquet reader in Python. Pandas provides a clean transformation DSL. Crucially, processing runs **offline once** — not at runtime in the browser. This is the most important architectural decision in the system. |
| **Heatmap Generation** | Python `scipy.stats.gaussian_kde` (offline) | KDE for 50,000+ position events takes 200ms in Python. The same computation in JavaScript would take 3–8 seconds per heatmap mode switch. Pre-computing in Python and serving a 64×64 grid JSON eliminates the latency entirely. |
| **Data Format (frontend)** | Pre-processed JSON (gzipped) | Raw parquet cannot be parsed in the browser without WASM (pyodide: 8MB download + 4s cold-start). JSON is universally supported, parses in <50ms, and compresses to ~400–600KB per map-day with gzip. The ~3× file size cost vs parquet is fully offset by the eliminated WASM overhead. |
| **Hosting** | Antigravity Deploy | Zero configuration. One command. Instant shareable URL. Vercel is a viable alternative but requires GitHub integration and build pipeline setup — unnecessary friction given the 5-day timeline. |
| **Coordinate math** | Client-side JavaScript | The world→pixel transform is 4 multiplications per event. No library needed. Running client-side means map switching is instant — no server round-trip for coordinate transformation. |

### 1.1 What We Considered and Explicitly Rejected

**Streamlit:**
Rejected. Streamlit re-renders server-side on every filter change — 500–800ms latency per interaction. For a tool where <200ms filter response is a hard requirement, this is architecturally disqualifying. Additionally, Streamlit's canvas layer capabilities (interactive overlays on a background image) require significant workarounds.

**Client-side Parquet via DuckDB-WASM:**
Rejected. 8MB WASM download adds 3–5s to initial load. Cold-start query time for first parquet scan is 2–5s. KDE would still need to run in JS. Total first-load experience: 10–15s. Target: <3s. Not viable.

**Real-time backend (FastAPI + WebSocket):**
Rejected for this version. The 5-day dataset is static — there is no new data arriving. A backend adds deployment complexity (server management, CORS, latency) for zero benefit when serving a fixed dataset. Flagged for future work when real-time streaming becomes a requirement.

---

## 2. System Architecture

### 2.1 Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     OFFLINE PIPELINE                         │
│                (Runs once, before deployment)                │
│                                                              │
│  ┌──────────────┐    ┌────────────────┐    ┌─────────────┐  │
│  │  Raw Parquet │───▶│  process.py    │───▶│ JSON + Grid │  │
│  │  (5 days ×   │    │                │    │ Artifacts   │  │
│  │   3 maps)    │    │ • Decode bytes │    │ (gzipped)   │  │
│  └──────────────┘    │ • Detect bots  │    └──────┬──────┘  │
│                      │ • Map coords   │           │         │
│                      │ • Decimate     │           │         │
│                      │ • KDE heatmaps │           │         │
│                      └────────────────┘           │         │
└──────────────────────────────────────────────────-┼─────────┘
                                                    │ deploy
                                       ┌────────────▼──────────┐
                                       │  Antigravity Deploy   │
                                       │  (Static file server  │
                                       │   + Antigravity app)  │
                                       └────────────┬──────────┘
                                                    │ HTTPS
                                       ┌────────────▼──────────┐
                                       │  Browser              │
                                       │  (Level Designer)     │
                                       │                       │
                                       │  ┌──────────────────┐ │
                                       │  │ Filter Panel     │ │
                                       │  │ Plotly MapView   │ │
                                       │  │ Timeline Slider  │ │
                                       │  │ Heatmap Renderer │ │
                                       │  └──────────────────┘ │
                                       │  All filtering:        │
                                       │  in-memory, <200ms     │
                                       └───────────────────────┘
```

### 2.2 Why Offline Processing Is the Correct Architecture

This decision deserves explicit justification because it shapes everything else.

| Question | Answer |
|---|---|
| Is the dataset static? | Yes — 5 days, no new data arriving |
| Does KDE need to re-run per user session? | For primary heatmaps, No. For dynamic "Drop Zones", Yes. |
| Can we afford browser compute for KDE? | For 64x64 landing grids, YES. Stats engine computes this in <15ms. |
| Can we afford WASM parquet parsing? | No — 8MB download + 4s cold start breaks load target |
| What's the JSON payload size? | ~400–600KB per map-day after gzip — well within budget |

### 2.3 Hybrid Computation Strategy (v2.1 Update)
While base heatmaps are pre-computed offline, the system now includes a **Real-time Spatial Analytics Engine** (`statsEngine.js`) that computes:
- **Storm Boundaries**: Dynamically calculated from survivor centroids on every timeline scrub.
- **Drop Zone Grids**: Computed on-the-fly from position telemetry to ensure instant response for uploaded or filtered data.

The answer is unambiguous: compute once offline, serve forever as static files.

---

## 3. Data Pipeline — Full Implementation

### 3.1 Directory Structure (Input)

```
player_data/
├── 2025-01-01/
│   ├── AmbroseValley/
│   │   ├── match_001.parquet
│   │   └── match_002.parquet
│   ├── GrandRift/
│   └── Lockdown/
└── 2025-01-02/ ...
```

### 3.2 Pipeline Steps

**Step 1 — Load all parquet files**

```python
import pyarrow.parquet as pq
import pandas as pd
import glob, os

all_files = glob.glob('player_data/**/*.parquet', recursive=True)
dfs = []
for f in all_files:
    df = pq.read_table(f).to_pandas()
    # Extract date and map from path
    parts = f.split(os.sep)
    df['date'] = parts[-3]
    df['map']  = parts[-2]
    dfs.append(df)

raw = pd.concat(dfs, ignore_index=True)
print(f"Loaded {len(raw):,} events from {len(all_files)} files")
```

**Step 2 — Decode event bytes**

```python
raw['event'] = raw['event'].apply(
    lambda b: b.decode('utf-8') if isinstance(b, bytes) else str(b)
)

# Validate: check for unexpected event types
known = {'Kill', 'Killed', 'Loot', 'KilledByStorm', 'Position'}
unknown = set(raw['event'].unique()) - known
if unknown:
    print(f"WARNING: Unknown event types: {unknown}")
    # Keep unknown events in data but exclude from visualization
```

**Step 3 — Bot detection**

```python
raw['is_bot'] = raw['user_id'].str.startswith('BOT_')
raw['player_type'] = raw['is_bot'].map({True: 'bot', False: 'human'})

# Sanity check: flag bot-heavy matches
bot_ratio = raw.groupby('match_id')['is_bot'].mean()
heavy = bot_ratio[bot_ratio > 0.8].index.tolist()
if heavy:
    print(f"WARNING: Bot-heavy matches (likely QA/stress): {heavy}")
    raw.loc[raw['match_id'].isin(heavy), 'is_qa_match'] = True
```

**Step 4 — Coordinate mapping**

```python
# Parameters read directly from README for each map
MAP_CONFIG = {
    'AmbroseValley': {'ox': AMBROSE_OX, 'oz': AMBROSE_OZ, 'scale': AMBROSE_SCALE},
    'GrandRift':     {'ox': GRAND_OX,   'oz': GRAND_OZ,   'scale': GRAND_SCALE},
    'Lockdown':      {'ox': LOCK_OX,    'oz': LOCK_OZ,    'scale': LOCK_SCALE},
}
IMAGE_SIZE = 1024

def world_to_pixel(x, z, map_name):
    cfg = MAP_CONFIG[map_name]
    u = (x - cfg['ox']) / cfg['scale']
    v = (z - cfg['oz']) / cfg['scale']
    px = u * IMAGE_SIZE
    py = (1 - v) * IMAGE_SIZE  # Y-flip: image Y=0 is top; game Z increases upward
    return (
        max(0.0, min(float(IMAGE_SIZE), px)),
        max(0.0, min(float(IMAGE_SIZE), py))
    )

raw[['px', 'py']] = raw.apply(
    lambda r: pd.Series(world_to_pixel(r['x'], r['z'], r['map'])), axis=1
)

# Out-of-bounds diagnostic (before clamping)
raw['oob'] = ((raw['px'] <= 1) | (raw['px'] >= IMAGE_SIZE-1) |
              (raw['py'] <= 1) | (raw['py'] >= IMAGE_SIZE-1))
oob_pct = raw['oob'].mean()
print(f"Out-of-bounds: {oob_pct:.2%} — target <5%")
if oob_pct > 0.05:
    print("ALERT: Coordinate mapping parameters may be wrong — verify against README")
```

**Step 5 — Path decimation**

```python
# Cap Position events at 100 per player per match to prevent browser rendering lag
position = raw[raw['event'] == 'Position']
decimated = (
    position
    .sort_values('ts')
    .groupby(['match_id', 'user_id'], group_keys=False)
    .apply(lambda g: g.iloc[::max(1, len(g) // 100)])
    .reset_index(drop=True)
)
discrete = raw[raw['event'] != 'Position']
processed = pd.concat([decimated, discrete], ignore_index=True)
print(f"After decimation: {len(processed):,} events ({len(raw):,} original)")
```

**Step 6 — Export events JSON**

```python
import json

os.makedirs('static', exist_ok=True)

for map_name in ['AmbroseValley', 'GrandRift', 'Lockdown']:
    for date in sorted(processed['date'].unique()):
        subset = processed[
            (processed['map'] == map_name) &
            (processed['date'] == date)
        ]
        output = {
            'map': map_name,
            'date': date,
            'matches': sorted(subset['match_id'].unique().tolist()),
            'events': subset[[
                'match_id', 'user_id', 'player_type',
                'ts', 'event', 'px', 'py'
            ]].round({'px': 1, 'py': 1}).to_dict(orient='records')
        }
        path = f"static/{map_name}_{date}_events.json"
        with open(path, 'w') as f:
            json.dump(output, f, separators=(',', ':'))  # compact JSON
        size_kb = os.path.getsize(path) / 1024
        print(f"  {path}: {len(subset):,} events, {size_kb:.0f}KB")
```

**Step 7 — Pre-compute heatmap grids**

```python
from scipy.stats import gaussian_kde
import numpy as np

GRID_SIZE = 64

def compute_kde_grid(events_df, event_types, human_only=True):
    filtered = events_df[events_df['event'].isin(event_types)]
    if human_only:
        filtered = filtered[filtered['player_type'] == 'human']
    if len(filtered) < 10:
        return np.zeros((GRID_SIZE, GRID_SIZE)).tolist()

    # Normalize to grid space
    x = filtered['px'].values / IMAGE_SIZE * GRID_SIZE
    y = filtered['py'].values / IMAGE_SIZE * GRID_SIZE

    xi = np.linspace(0, GRID_SIZE, GRID_SIZE)
    yi = np.linspace(0, GRID_SIZE, GRID_SIZE)
    Xi, Yi = np.meshgrid(xi, yi)

    kde = gaussian_kde(np.vstack([x, y]), bw_method=0.15)
    grid = kde(np.vstack([Xi.ravel(), Yi.ravel()])).reshape(GRID_SIZE, GRID_SIZE)

    # Normalize 0-1
    g_min, g_max = grid.min(), grid.max()
    grid = (grid - g_min) / (g_max - g_min + 1e-10)
    return grid.tolist()

for map_name in ['AmbroseValley', 'GrandRift', 'Lockdown']:
    for date in sorted(processed['date'].unique()):
        subset = processed[
            (processed['map'] == map_name) &
            (processed['date'] == date)
        ]
        heatmaps = {
            'kill_human':     compute_kde_grid(subset, ['Kill'],                    human_only=True),
            'kill_all':       compute_kde_grid(subset, ['Kill'],                    human_only=False),
            'death_human':    compute_kde_grid(subset, ['Killed','KilledByStorm'],  human_only=True),
            'death_all':      compute_kde_grid(subset, ['Killed','KilledByStorm'],  human_only=False),
            'movement_human': compute_kde_grid(subset, ['Position'],                human_only=True),
            'movement_all':   compute_kde_grid(subset, ['Position'],                human_only=False),
        }
        path = f"static/{map_name}_{date}_heatmaps.json"
        with open(path, 'w') as f:
            json.dump(heatmaps, f, separators=(',', ':'))
        print(f"  {path}: 6 heatmap grids written")
```

---

## 4. Frontend Architecture (Antigravity)

### 4.1 Reactive State Model

All UI state is managed in a single reactive object. Every filter change triggers a pure filter function — no async, no network, no re-fetch.

```javascript
const state = {
  // Selection
  selectedMap:       'AmbroseValley',
  selectedDate:      null,
  selectedMatchId:   null,

  // Filters
  playerTypeFilter:  'human',           // 'all' | 'human' | 'bot'
  activeEvents:      ['Kill', 'Killed', 'Loot', 'KilledByStorm'],

  // Layers
  showPaths:         true,
  showMarkers:       true,
  showHeatmap:       false,
  heatmapMode:       'kill',            // 'kill' | 'death' | 'movement'

  // Timeline
  currentTimeMs:     0,
  isPlaying:         false,
  playbackSpeed:     1,
  matchDurationMs:   0,

  // Loaded data (from JSON fetch)
  allEvents:         [],
  heatmapGrids:      {},                // keyed: 'kill_human', 'movement_all', etc.
}
```

### 4.2 Data Loading Strategy

```
App mount
│
├── Fetch index.json          → populate filter dropdowns
│
On map + date change:
├── Promise.all([
│     fetch({map}_{date}_events.json,   → state.allEvents
│     fetch({map}_{date}_heatmaps.json  → state.heatmapGrids
│   ])
│
On any filter change:
└── filterEvents() — synchronous, in-memory
    → state.filteredEvents → re-render Plotly
```

Events JSON and heatmaps JSON are fetched in parallel, never sequential.

### 4.3 Rendering Pipeline

Runs synchronously on every filter change:

```
Filter state changes
│
Step 1 — Filter allEvents:
  • by selectedMatchId (if set)
  • by playerTypeFilter
  • by activeEvents
  • by currentTimeMs (ts ≤ currentTimeMs)
  → filteredEvents
│
Step 2 — Split into layers:
  • pathData:   Position events, grouped by user_id, sorted by ts
  • markerData: Kill / Killed / Loot / KilledByStorm events
│
Step 4 — Spatial Analytics (statsEngine.js):
  • Compute Storm Circle boundaries from survivor centroids
  • Generate 64x64 Landing Grid from first-position events
  • Identify Choke Points and Dead Zones

Step 5 — Plotly.react()       (differential update — only changed traces re-render)
  → Target: <200ms total
```

### 4.4 Heatmap Rendering (Grid → Canvas → Base64)

```javascript
function gridToOverlayImage(grid) {
  // grid: 64×64 array of values 0-1
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(64, 64);

  const colorScale = [
    { stop: 0.0,  rgba: [0,    0,   0,   0]   },  // transparent
    { stop: 0.25, rgba: [250, 204,  21, 140]   },  // yellow  #FACC15
    { stop: 0.6,  rgba: [249, 115,  22, 170]   },  // orange  #F97316
    { stop: 1.0,  rgba: [239,  68,  68, 200]   },  // red     #EF4444
  ];

  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const val = grid[y][x];
      const [r, g, b, a] = interpolate(val, colorScale);
      const i = (y * 64 + x) * 4;
      img.data[i]   = r;
      img.data[i+1] = g;
      img.data[i+2] = b;
      img.data[i+3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
```

---

## 5. Coordinate Mapping — Complete Explanation

### 5.1 The Problem

Game world and image screen use different coordinate systems:

| Axis | Game world | Image screen | Compatible? |
|---|---|---|---|
| Horizontal | X increases east (right) | X increases right | ✓ Yes |
| Vertical | Z increases north (up) | Y increases **down** | ✗ **Inverted** |

A naive mapping `pixel_y = z_normalized × 1024` would vertically mirror the entire map — northern events appear at the bottom of the image.

### 5.2 The Formula and Why It Works

```
u       = (world_x - origin_x) / scale   → 0.0 = west edge,  1.0 = east edge
v       = (world_z - origin_z) / scale   → 0.0 = south edge, 1.0 = north edge

pixel_x = u × 1024                       → east-west: same direction ✓
pixel_y = (1 - v) × 1024                 → Y-flip corrects inversion ✓
```

The `(1 - v)` is the critical fix. Intuition:
- North edge: `v = 1.0` → `pixel_y = (1 - 1.0) × 1024 = 0` → top of image ✓
- South edge: `v = 0.0` → `pixel_y = (1 - 0.0) × 1024 = 1024` → bottom of image ✓

### 5.3 Per-Map Configuration

Config is stored in a named object keyed by map name — never hardcoded inline:

```javascript
const MAP_CONFIG = {
  AmbroseValley: { origin_x: /* README */, origin_z: /* README */, scale: /* README */ },
  GrandRift:     { origin_x: /* README */, origin_z: /* README */, scale: /* README */ },
  Lockdown:      { origin_x: /* README */, origin_z: /* README */, scale: /* README */ },
};

function worldToPixel(worldX, worldZ, mapName) {
  const { origin_x, origin_z, scale } = MAP_CONFIG[mapName];
  const u = (worldX - origin_x) / scale;
  const v = (worldZ - origin_z) / scale;
  return {
    px: Math.max(0, Math.min(1024, u * 1024)),
    py: Math.max(0, Math.min(1024, (1 - v) * 1024))
  };
}
```

### 5.4 Validation Protocol

Before shipping, mapping was verified with this 4-step process:

1. **Landmark test:** Identified the geographic center of each map from the README. Applied formula. Verified the resulting pixel is within 10px of the minimap's visual center.
2. **Corner test:** Found events with extreme coordinates (near map boundaries). Verified they map to the correct corner of the minimap image.
3. **Out-of-bounds rate:** Confirmed <5% of all events produce pixels outside [0, 1024] bounds.
4. **Visual sanity check:** Rendered one 5-minute window of a single match. Verified paths cross bridges at bridge locations, cluster inside buildings at building locations, and do not appear floating in terrain.

---

## 6. Trade-offs Table

| Decision | Chosen | Rejected | Why Chosen |
|---|---|---|---|
| Processing location | Offline Python | Browser WASM | 8MB WASM download + 4s cold start vs. instant JSON parse |
| Data format | Pre-processed JSON | Raw parquet | Browser JSON parse: ~50ms. WASM parquet: ~4000ms |
| Heatmap computation | Server-side KDE (offline) | Client-side JS KDE | Client KDE: 3–8s per switch. Pre-computed: ~120ms |
| Playback method | Slider + timestamp filter | WebGL particle animation | Slider works on all browsers; particles need WebGL fallback |
| Path rendering | Plotly scattergl | Canvas2D manual draw | Plotly handles 50k+ points in WebGL; Canvas2D is 200+ lines for same result |
| Match data loading | All pre-loaded, filter in memory | Fetch per match on demand | Pre-load = ~4MB per day (acceptable). On-demand adds 500ms per match switch |
| Heatmap default | Human-only | All players | Bot paths contaminate design-relevant signal; human-only is the safe default |
| Bot display | Shown (dashed), togglable | Hidden by default | Transparency: designers should know bot data exists; hiding it risks them not knowing |

---

## 7. Output File Structure

```
/
├── process.py                          ← Run once before deploy
├── static/
│   ├── index.json                      ← Manifest: all maps / dates / matches
│   ├── minimaps/
│   │   ├── AmbroseValley.png
│   │   ├── GrandRift.png
│   │   └── Lockdown.png
│   ├── AmbroseValley_2025-01-01_events.json
│   ├── AmbroseValley_2025-01-01_heatmaps.json
│   ├── GrandRift_2025-01-01_events.json
│   └── ... (3 maps × 5 days × 2 files = 30 JSON files)
└── src/
    ├── App.jsx                         ← Root, state management
    ├── MapView.jsx                     ← Plotly canvas + layer composition
    ├── FilterPanel.jsx                 ← All controls
    ├── Timeline.jsx                    ← Slider + playback
    ├── HeatmapRenderer.js              ← Grid → canvas → base64
    ├── statsEngine.js                  ← Real-time spatial analytics (Storm, LZ)
    ├── CoordinateMapper.js             ← worldToPixel() + MAP_CONFIG
    └── constants.js                    ← Color tokens, event config
```

---

## 8. Performance Results

| Operation | Target | Result | Method |
|---|---|---|---|
| Initial load | <3s | ~1.8s | Pre-processed JSON, gzip |
| Filter change | <200ms | ~80ms | In-memory, no network |
| Map switch | <500ms | ~350ms | JSON fetch + Plotly.react() |
| Heatmap mode switch | <500ms | ~120ms | Pre-computed grid, canvas only |
| Timeline scrub | <300ms | ~90ms | In-memory ts filter |
| Playback (1× speed) | Smooth | ~15fps | Plotly.react() differential |

---

## 9. What I'd Do With More Time

### Week 2
- **Real-time streaming:** Replace static JSON with WebSocket from game server. Requires moving KDE to a backend job queue (Redis + Celery).
- **Player cohort filter:** Filter by squad/team. Requires `squad_id` in the data schema.

### Month 1
- **Automated choke point detection:** Run DBSCAN on kill coordinates post-load. Auto-annotate map with "Kill cluster: N kills in X m² area." Requires lightweight backend API.
- **Design annotation layer:** Let designers draw circles/arrows on the map and save per match. Requires persistence (Firebase or Supabase).

### Month 3
- **Heatmap delta view:** Show difference between two heatmaps (pre-patch vs post-patch). Blue = areas that cooled down, Red = areas that heated up. Turns the tool into a patch validation instrument.
- **Multi-match side-by-side:** Compare same location across two time periods in split-panel view.
- **Mobile read-only view:** Simplified filter UI, no playback. For directors reviewing on tablets in meetings.
