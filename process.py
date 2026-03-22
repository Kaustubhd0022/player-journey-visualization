import pyarrow.parquet as pq
import pandas as pd
import numpy as np
import json
import glob
import os
from scipy.stats import gaussian_kde

# ── STEP 2A: SET MAP CONFIG FROM README ──────────────────────────────────────
MAP_CONFIG = {
    'AmbroseValley': {
        'origin_x': -370,
        'origin_z': -473,
        'scale':    900,
    },
    'GrandRift': {
        'origin_x': -290,
        'origin_z': -290,
        'scale':    581,
    },
    'Lockdown': {
        'origin_x': -500,
        'origin_z': -500,
        'scale':    1000,
    },
}
IMAGE_SIZE = 1024
GRID_SIZE  = 64

# ── STEP 2B: LOAD ALL PARQUET FILES ─────────────────────────────────────────
print("Loading parquet files...")
all_files = glob.glob('player_data/February_*/*', recursive=True)
# Filter out non-files like .DS_Store
all_files = [f for f in all_files if os.path.isfile(f) and not f.endswith('README.md') and not f.endswith('.DS_Store') and 'minimaps' not in f]
print(f"Found {len(all_files)} data files")

dfs = []
for f in all_files:
    try:
        df = pq.read_table(f).to_pandas()
        # Extract date from folder name (e.g. February_10)
        parts = os.path.normpath(f).split(os.sep)
        for part in parts:
            if part.startswith('February_'):
                df['date'] = part
                break
        dfs.append(df)
    except Exception as e:
        print(f"  WARN: Failed to read {f}: {e}")

if not dfs:
    print("CRITICAL: No data files loaded. Check file paths.")
    exit(1)

raw = pd.concat(dfs, ignore_index=True)
print(f"Loaded {len(raw):,} total events")

# Ensure map_name column exists (README says it's map_id)
if 'map_id' in raw.columns:
    raw['map_name'] = raw['map_id']
elif 'map' in raw.columns:
    raw['map_name'] = raw['map']

print(f"Maps in data: {raw['map_name'].unique().tolist()}")
print(f"Columns: {raw.columns.tolist()}")

# ── STEP 2C: DECODE EVENT BYTES ─────────────────────────────────────────────
print("\nDecoding event bytes...")
if raw['event'].dtype == object:
    raw['event'] = raw['event'].apply(
        lambda b: b.decode('utf-8') if isinstance(b, bytes) else str(b)
    )
print(f"Event types found: {raw['event'].value_counts().to_dict()}")

# ── STEP 2D: BOT DETECTION ──────────────────────────────────────────────────
# Human player: user_id is a UUID
# Bot: user_id is a short numeric ID
def check_is_bot(uid):
    uid_str = str(uid)
    return uid_str.isdigit()

raw['is_bot'] = raw['user_id'].apply(check_is_bot)
raw['player_type'] = raw['is_bot'].map({True: 'bot', False: 'human'})

total_players = len(raw['user_id'].unique())
bots_count  = raw[raw['is_bot']]['user_id'].nunique()
bot_pct = (bots_count / total_players * 100) if total_players > 0 else 0
print(f"\nPlayers: {total_players} total, {bots_count} bots ({bot_pct:.1f}%), {total_players-bots_count} humans")

# Flag bot-heavy matches
bot_ratio = raw.groupby('match_id')['is_bot'].mean()
heavy = bot_ratio[bot_ratio > 0.8].index.tolist()
if heavy:
    print(f"WARNING: {len(heavy)} bot-heavy matches (>80% bot)")

# ── STEP 2E: COORDINATE MAPPING ─────────────────────────────────────────────
def world_to_pixel(x, z, map_name):
    if map_name not in MAP_CONFIG:
        return (None, None)
    cfg = MAP_CONFIG[map_name]
    u  = (x - cfg['origin_x']) / cfg['scale']
    v  = (z - cfg['origin_z']) / cfg['scale']
    px = u * IMAGE_SIZE
    py = (1 - v) * IMAGE_SIZE   # Y-FLIP: image y=0 is top
    # Use clamping as suggested in PRD
    px = max(0.0, min(float(IMAGE_SIZE), px))
    py = max(0.0, min(float(IMAGE_SIZE), py))
    return (round(float(px), 1), round(float(py), 1))

print("\nMapping coordinates...")
# Game uses Z for north-south axis
x_col = 'x'
z_col = 'z'

pixels = raw.apply(
    lambda r: pd.Series(world_to_pixel(r[x_col], r[z_col], r['map_name'])),
    axis=1
)
raw[['px', 'py']] = pixels

# Validate out-of-bounds rate (if we didn't clamp)
# For now, just check if any are None
raw['valid_map'] = raw['px'].notna() & raw['py'].notna()
valid_pct = raw['valid_map'].mean()
print(f"Valid mapping rate: {valid_pct:.2%}")

# Drop rows where mapping failed (unknown maps etc)
raw = raw.dropna(subset=['px', 'py'])

# ── STEP 2F: PATH DECIMATION ────────────────────────────────────────────────
print("\nDecimating position events...")
# Map movement events based on README
# Position = human, BotPosition = bot
raw['is_position_event'] = raw['event'].isin(['Position', 'BotPosition'])

position_evts = raw[raw['is_position_event']]
discrete_evts = raw[~raw['is_position_event']]

MAX_POS_PER_PLAYER = 100
decimated = (
    position_evts
    .sort_values('ts')
    .groupby(['match_id', 'user_id'], group_keys=False)
    .apply(lambda g: g.iloc[::max(1, len(g) // MAX_POS_PER_PLAYER)])
    .reset_index(drop=True)
)
processed = pd.concat([decimated, discrete_evts], ignore_index=True)
print(f"Events after decimation: {len(processed):,} (from {len(raw):,})")

# ── STEP 2G: EXPORT EVENTS JSON ─────────────────────────────────────────────
print("\nExporting events JSON...")
os.makedirs('static', exist_ok=True)

# Build index of all available map/date/match combinations
index = {}

for map_name in MAP_CONFIG.keys():
    for date in sorted(processed['date'].unique()):
        subset = processed[
            (processed['map_name'] == map_name) &
            (processed['date'] == date)
        ]
        if len(subset) == 0:
            continue

        match_ids = sorted(subset['match_id'].unique().tolist())

        output = {
            'map':     map_name,
            'date':    str(date),
            'matches': match_ids,
            'events':  subset[[
                'match_id', 'user_id', 'player_type',
                'ts', 'event', 'px', 'py'
            ]].to_dict(orient='records')
        }

        # Convert ts to int milliseconds if it's a timestamp object
        for ev in output['events']:
            if hasattr(ev['ts'], 'timestamp'):
                # Some ts are 1970-01-21 11:52:07.161
                # The README says it represents time elapsed within the match
                # 1970-01-21 is about 20 days since epoch. 20 days = 20 * 86400 * 1000 ms.
                # Let's check the base date.
                epoch = pd.Timestamp(0, unit='ms')
                ev['ts'] = int((ev['ts'] - epoch).total_seconds() * 1000)
            else:
                ev['ts'] = int(ev['ts'])

        fname = f"static/{map_name}_{date}_events.json"
        with open(fname, 'w') as f:
            json.dump(output, f, separators=(',', ':'))

        size_kb = os.path.getsize(fname) / 1024
        print(f"  {fname}: {len(subset):,} events, {size_kb:.0f}KB")

        key = f"{map_name}_{date}"
        index[key] = {
            'map': map_name,
            'date': str(date),
            'matches': match_ids,
            'eventFile': f"{map_name}_{date}_events.json",
            'heatmapFile': f"{map_name}_{date}_heatmaps.json",
        }

# ── STEP 2H: COMPUTE HEATMAPS ───────────────────────────────────────────────
print("\nComputing KDE heatmaps...")

def compute_kde_grid(df, event_types, human_only=True):
    filtered = df[df['event'].isin(event_types)]
    if human_only:
        filtered = filtered[filtered['player_type'] == 'human']
    if len(filtered) < 10:
        return np.zeros((GRID_SIZE, GRID_SIZE)).tolist()
    
    x = filtered['px'].values / IMAGE_SIZE * GRID_SIZE
    y = filtered['py'].values / IMAGE_SIZE * GRID_SIZE
    
    xi = np.linspace(0, GRID_SIZE, GRID_SIZE)
    yi = np.linspace(0, GRID_SIZE, GRID_SIZE)
    Xi, Yi = np.meshgrid(xi, yi)
    
    try:
        kde = gaussian_kde(np.vstack([x, y]), bw_method=0.15)
        grid = kde(np.vstack([Xi.ravel(), Yi.ravel()])).reshape(GRID_SIZE, GRID_SIZE)
    except Exception as e:
        print(f"    KDE error: {e}")
        return np.zeros((GRID_SIZE, GRID_SIZE)).tolist()
    
    g_min, g_max = grid.min(), grid.max()
    grid = (grid - g_min) / (g_max - g_min + 1e-10)
    return grid.tolist()

for map_name in MAP_CONFIG.keys():
    for date in sorted(processed['date'].unique()):
        subset = processed[
            (processed['map_name'] == map_name) &
            (processed['date'] == date)
        ]
        if len(subset) == 0:
            continue
        
        # Kill = human kill, BotKill = bot kill. PRD says use Kill.
        # Death = human killed, BotKilled = bot killed. PRD says use Killed + KilledByStorm.
        
        heatmaps = {
            'kill_human':     compute_kde_grid(subset, ['Kill'],                   human_only=True),
            'kill_all':       compute_kde_grid(subset, ['Kill', 'BotKill'],        human_only=False),
            'death_human':    compute_kde_grid(subset, ['Killed', 'KilledByStorm'], human_only=True),
            'death_all':      compute_kde_grid(subset, ['Killed', 'BotKilled', 'KilledByStorm'], human_only=False),
            'movement_human': compute_kde_grid(subset, ['Position'],               human_only=True),
            'movement_all':   compute_kde_grid(subset, ['Position', 'BotPosition'], human_only=False),
        }
        fname = f"static/{map_name}_{date}_heatmaps.json"
        with open(fname, 'w') as f:
            json.dump(heatmaps, f, separators=(',', ':'))
        print(f"  {fname}: 6 grids written")

# Write index
with open('static/index.json', 'w') as f:
    json.dump(index, f, indent=2)
print(f"\nDone. static/index.json written with {len(index)} map-date combinations.")
