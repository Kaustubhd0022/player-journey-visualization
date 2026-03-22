import pyarrow.parquet as pq
import pandas as pd
import numpy as np
import json, glob, os
from scipy.stats import gaussian_kde

print("=== LILA DATA PIPELINE DIAGNOSTIC ===")

# ── MAP CONFIG — fill from README ───────────────────────────────────────────
MAP_CONFIG = {
    'AmbroseValley': {'origin_x': None, 'origin_z': None, 'scale': None},
    'GrandRift':     {'origin_x': None, 'origin_z': None, 'scale': None},
    'Lockdown':      {'origin_x': None, 'origin_z': None, 'scale': None},
}
IMAGE_SIZE = 1024
GRID_SIZE  = 64

# ── STEP 1: LOAD ALL FILES ───────────────────────────────────────────────────
all_files = glob.glob('player_data/**/*.parquet', recursive=True)
print(f"\nStep 1: Found {len(all_files)} parquet files")
for f in all_files:
    print(f"  {f}")

dfs = []
for f in all_files:
    try:
        table = pq.read_table(f)
        df    = table.to_pandas()
        print(f"  Loaded {f}: {len(df)} rows, columns: {df.columns.tolist()}")
        
        # Extract date and map from path
        parts = os.path.normpath(f).split(os.sep)
        print(f"  Path parts: {parts}")
        
        # Try multiple strategies to get date and map
        for i, part in enumerate(parts):
            if part.startswith('202') and len(part) == 10:
                df['date'] = part
                print(f"  Date from path: {part}")
            if part in MAP_CONFIG:
                df['map_name'] = part
                print(f"  Map from path: {part}")
        
        # If map not in path, check if it's a column
        if 'map_name' not in df.columns:
            if 'map' in df.columns:
                df['map_name'] = df['map'].astype(str)
                print(f"  Map from column: {df['map'].unique().tolist()}")
            else:
                print(f"  WARNING: Cannot determine map for {f}")
                df['map_name'] = 'Unknown'
        
        if 'date' not in df.columns:
            df['date'] = 'unknown'
            print(f"  WARNING: Cannot determine date for {f}")
        
        dfs.append(df)
    except Exception as e:
        print(f"  ERROR loading {f}: {e}")

if not dfs:
    print("CRITICAL: No files loaded. Check player_data/ directory structure.")
    exit(1)

raw = pd.concat(dfs, ignore_index=True)
print(f"\nStep 1 result: {len(raw)} total events loaded")
print(f"Columns: {raw.columns.tolist()}")
print(f"Sample row:\n{raw.iloc[0].to_dict()}")

# ── STEP 2: DECODE EVENT BYTES ───────────────────────────────────────────────
print(f"\nStep 2: Decoding event field")
print(f"Event field dtype: {raw['event'].dtype}")
print(f"Sample event values (raw): {raw['event'].head(5).tolist()}")

def decode_event(val):
    if val is None:
        return 'Unknown'
    if isinstance(val, bytes):
        return val.decode('utf-8', errors='replace')
    if isinstance(val, str):
        return val
    try:
        return bytes(val).decode('utf-8', errors='replace')
    except:
        return str(val)

raw['event'] = raw['event'].apply(decode_event)
print(f"Event type breakdown after decode:")
print(raw['event'].value_counts().to_dict())

before = len(raw)
VALID_EVENTS = {'Kill', 'Killed', 'Loot', 'KilledByStorm', 'Position'}
unknown_events = set(raw['event'].unique()) - VALID_EVENTS
if unknown_events:
    print(f"WARNING: Unknown event types found: {unknown_events}")
    print(f"These will still be included in the output but won't render as markers")

print(f"Step 2 result: {len(raw)} events (no events dropped at decode stage)")

# ── STEP 3: BOT DETECTION ────────────────────────────────────────────────────
print(f"\nStep 3: Bot detection")

# Show sample user IDs to confirm prefix
print(f"Sample user IDs: {raw['user_id'].head(10).tolist()}")

BOT_PREFIX = 'BOT_'
raw['is_bot'] = raw['user_id'].astype(str).str.startswith(BOT_PREFIX)
raw['player_type'] = raw['is_bot'].map({True: 'bot', False: 'human'})

human_count = raw[~raw['is_bot']]['user_id'].nunique()
bot_count   = raw[raw['is_bot']]['user_id'].nunique()
print(f"Unique human players: {human_count}")
print(f"Unique bot players: {bot_count}")
print(f"If bot count is 0, check BOT_PREFIX — current value: '{BOT_PREFIX}'")

# ── STEP 4: COORDINATE MAPPING ───────────────────────────────────────────────
print(f"\nStep 4: Coordinate mapping")

# Detect coordinate column names
x_col = 'x' if 'x' in raw.columns else None
z_col = 'z' if 'z' in raw.columns else None

if 'pos_x' in raw.columns: x_col = 'pos_x'
if 'pos_z' in raw.columns: z_col = 'pos_z'
if 'world_x' in raw.columns: x_col = 'world_x'
if 'world_z' in raw.columns: z_col = 'world_z'

print(f"Using X column: {x_col}")
print(f"Using Z column: {z_col}")

if not x_col or not z_col:
    print(f"CRITICAL: Cannot find coordinate columns. Available: {raw.columns.tolist()}")
    print(f"Looking for x/z or pos_x/pos_z or world_x/world_z")
    exit(1)

# Show coordinate ranges before mapping
print(f"X range: {raw[x_col].min():.1f} to {raw[x_col].max():.1f}")
print(f"Z range: {raw[z_col].min():.1f} to {raw[z_col].max():.1f}")

def world_to_pixel(x, z, map_name):
    if map_name not in MAP_CONFIG:
        return (None, None)
    cfg = MAP_CONFIG[map_name]
    if cfg['origin_x'] is None or cfg['origin_z'] is None or cfg['scale'] is None:
        return (None, None)
    u  = (float(x) - cfg['origin_x']) / cfg['scale']
    v  = (float(z) - cfg['origin_z']) / cfg['scale']
    px = u * IMAGE_SIZE
    py = (1.0 - v) * IMAGE_SIZE
    px = max(0.0, min(float(IMAGE_SIZE), px))
    py = max(0.0, min(float(IMAGE_SIZE), py))
    return (round(px, 1), round(py, 1))

# Check if any map config is set
any_config_set = any(
    v['origin_x'] is not None
    for v in MAP_CONFIG.values()
)

if not any_config_set:
    print("WARNING: MAP_CONFIG has no values set.")
    print("Reading coordinate ranges to help you set them:")
    for map_name in raw['map_name'].unique():
        subset = raw[raw['map_name'] == map_name]
        print(f"\n  {map_name}:")
        print(f"    X: {subset[x_col].min():.1f} to {subset[x_col].max():.1f}")
        print(f"    Z: {subset[z_col].min():.1f} to {subset[z_col].max():.1f}")
        x_range = subset[x_col].max() - subset[x_col].min()
        z_range = subset[z_col].max() - subset[z_col].min()
        map_range = max(x_range, z_range)
        print(f"    Suggested origin_x: {subset[x_col].min():.1f}")
        print(f"    Suggested origin_z: {subset[z_col].min():.1f}")
        print(f"    Suggested scale: {map_range:.1f}")
        print(f"    (These are auto-calculated — verify against README)")
    
    print("\nAUTO-SETTING coordinates from data range since MAP_CONFIG is empty...")
    for map_name in raw['map_name'].unique():
        if map_name in MAP_CONFIG:
            subset = raw[raw['map_name'] == map_name]
            x_min = float(subset[x_col].min())
            z_min = float(subset[z_col].min())
            x_range = float(subset[x_col].max() - subset[x_col].min())
            z_range = float(subset[z_col].max() - subset[z_col].min())
            scale   = max(x_range, z_range)
            MAP_CONFIG[map_name] = {
                'origin_x': x_min,
                'origin_z': z_min,
                'scale':    scale if scale > 0 else 1.0,
            }
            print(f"  Auto-set {map_name}: origin=({x_min:.1f}, {z_min:.1f}), scale={scale:.1f}")

pixels = raw.apply(
    lambda r: pd.Series(world_to_pixel(r[x_col], r[z_col], r['map_name'])),
    axis=1
)
raw[['px', 'py']] = pixels

missing_coords = raw['px'].isna().sum()
total          = len(raw)
print(f"Events with valid pixel coords: {total - missing_coords} / {total}")
print(f"Missing coords: {missing_coords} ({(missing_coords/total*100):.1f}%)")

if missing_coords > total * 0.1:
    print("WARNING: >10% events have no pixel coords")
    missing_maps = raw[raw['px'].isna()]['map_name'].value_counts()
    print(f"Missing by map: {missing_maps.to_dict()}")

# Drop only rows where BOTH px and py are null
raw = raw.dropna(subset=['px', 'py'])
print(f"After dropping null coords: {len(raw)} events remain")

# ── STEP 5: PATH DECIMATION ──────────────────────────────────────────────────
print(f"\nStep 5: Path decimation")

position_evts = raw[raw['event'] == 'Position']
discrete_evts = raw[raw['event'] != 'Position']

print(f"Position events before decimation: {len(position_evts)}")
print(f"Discrete events (markers): {len(discrete_evts)}")
print(f"  Kill:          {len(discrete_evts[discrete_evts['event']=='Kill'])}")
print(f"  Killed:        {len(discrete_evts[discrete_evts['event']=='Killed'])}")
print(f"  Loot:          {len(discrete_evts[discrete_evts['event']=='Loot'])}")
print(f"  KilledByStorm: {len(discrete_evts[discrete_evts['event']=='KilledByStorm'])}")

MAX_POS = 150  # increased from 100 to show more path detail
decimated = (
    position_evts
    .sort_values('ts')
    .groupby(['match_id', 'user_id'], group_keys=False)
    .apply(lambda g: g.iloc[::max(1, len(g) // MAX_POS)])
    .reset_index(drop=True)
)

print(f"Position events after decimation: {len(decimated)}")
processed = pd.concat([decimated, discrete_evts], ignore_index=True)
print(f"Total events in final dataset: {len(processed)}")

# ── STEP 6: EXPORT JSON ──────────────────────────────────────────────────────
print(f"\nStep 6: Exporting JSON files")
os.makedirs('static', exist_ok=True)
os.makedirs('static/minimaps', exist_ok=True)

index = {}

for map_name in MAP_CONFIG.keys():
    map_data = processed[processed['map_name'] == map_name]
    if len(map_data) == 0:
        print(f"  SKIP {map_name}: no events")
        continue
    
    for date in sorted(map_data['date'].unique()):
        subset = map_data[map_data['date'] == date]
        match_ids = sorted(subset['match_id'].astype(str).unique().tolist())
        
        # Build output — keep ALL events, don't filter anything here
        output = {
            'map':     map_name,
            'date':    str(date),
            'matches': match_ids,
            'totalEvents': len(subset),
            'events':  subset[[
                'match_id', 'user_id', 'player_type',
                'ts', 'event', 'px', 'py'
            ]].assign(
                match_id=subset['match_id'].astype(str),
                user_id=subset['user_id'].astype(str),
                ts=subset['ts'].astype(float),
                px=subset['px'].round(1),
                py=subset['py'].round(1),
            ).to_dict(orient='records')
        }
        
        fname = f"static/{map_name}_{date}_events.json"
        with open(fname, 'w') as f:
            json.dump(output, f, separators=(',', ':'))
        
        size_kb = os.path.getsize(fname) / 1024
        print(f"  {fname}: {len(subset)} events, {len(match_ids)} matches, {size_kb:.0f}KB")
        
        key = f"{map_name}_{date}"
        index[key] = {
            'map': map_name,
            'date': str(date),
            'matches': match_ids,
            'eventCount': len(subset),
            'eventFile': f"{map_name}_{date}_events.json",
            'heatmapFile': f"{map_name}_{date}_heatmaps.json",
        }

# ── STEP 7: HEATMAPS ─────────────────────────────────────────────────────────
print(f"\nStep 7: Computing heatmaps")

def compute_kde_grid(df, event_types, human_only=True):
    filtered = df[df['event'].isin(event_types)]
    if human_only:
        filtered = filtered[filtered['player_type'] == 'human']
    if len(filtered) < 5:
        return np.zeros((GRID_SIZE, GRID_SIZE)).tolist()
    x = filtered['px'].values / IMAGE_SIZE * GRID_SIZE
    y = filtered['py'].values / IMAGE_SIZE * GRID_SIZE
    xi = np.linspace(0, GRID_SIZE, GRID_SIZE)
    yi = np.linspace(0, GRID_SIZE, GRID_SIZE)
    Xi, Yi = np.meshgrid(xi, yi)
    try:
        kde  = gaussian_kde(np.vstack([x, y]), bw_method=0.15)
        grid = kde(np.vstack([Xi.ravel(), Yi.ravel()])).reshape(GRID_SIZE, GRID_SIZE)
        g_min, g_max = grid.min(), grid.max()
        if g_max > g_min:
            grid = (grid - g_min) / (g_max - g_min)
        else:
            grid = np.zeros_like(grid)
        return grid.tolist()
    except Exception as e:
        print(f"  KDE failed: {e}")
        return np.zeros((GRID_SIZE, GRID_SIZE)).tolist()

for map_name in MAP_CONFIG.keys():
    map_data = processed[processed['map_name'] == map_name]
    if len(map_data) == 0:
        continue
    for date in sorted(map_data['date'].unique()):
        subset = map_data[map_data['date'] == date]
        
        # Detect actual kill event string (may differ from 'Kill')
        actual_kill   = [e for e in subset['event'].unique() if 'kill' in e.lower() and 'storm' not in e.lower() and 'killed' not in e.lower()]
        actual_killed = [e for e in subset['event'].unique() if 'killed' in e.lower() and 'storm' not in e.lower()]
        actual_storm  = [e for e in subset['event'].unique() if 'storm' in e.lower()]
        actual_pos    = [e for e in subset['event'].unique() if 'position' in e.lower() or 'pos' == e.lower()]
        
        kill_types  = actual_kill  or ['Kill']
        death_types = (actual_killed or ['Killed']) + (actual_storm or ['KilledByStorm'])
        pos_types   = actual_pos   or ['Position']
        
        print(f"  {map_name} {date}: using kill={kill_types}, death={death_types}, pos={pos_types}")
        
        heatmaps = {
            'kill_human':     compute_kde_grid(subset, kill_types,  human_only=True),
            'kill_all':       compute_kde_grid(subset, kill_types,  human_only=False),
            'death_human':    compute_kde_grid(subset, death_types, human_only=True),
            'death_all':      compute_kde_grid(subset, death_types, human_only=False),
            'movement_human': compute_kde_grid(subset, pos_types,   human_only=True),
            'movement_all':   compute_kde_grid(subset, pos_types,   human_only=False),
        }
        
        fname = f"static/{map_name}_{date}_heatmaps.json"
        with open(fname, 'w') as f:
            json.dump(heatmaps, f, separators=(',', ':'))
        
        # Verify grids are not all zeros
        kill_sum = sum(sum(row) for row in heatmaps['kill_human'])
        move_sum = sum(sum(row) for row in heatmaps['movement_human'])
        print(f"  Heatmap validation — kill sum: {kill_sum:.2f}, movement sum: {move_sum:.2f}")
        if kill_sum == 0:
            print(f"  WARNING: Kill heatmap is all zeros for {map_name} {date}")
        if move_sum == 0:
            print(f"  WARNING: Movement heatmap is all zeros for {map_name} {date}")

# Write index
with open('static/index.json', 'w') as f:
    json.dump(index, f, indent=2)

print(f"\n=== PIPELINE COMPLETE ===")
print(f"Total map-date combinations: {len(index)}")
for key, val in index.items():
    print(f"  {key}: {val['eventCount']} events, {len(val['matches'])} matches")
