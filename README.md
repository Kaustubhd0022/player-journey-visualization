# LILA BLACK — Player Journey Visualization Tool

> A browser-based map intelligence tool that transforms raw gameplay telemetry into spatial, time-aware visualizations. Built for Level Designers at LILA Games.

---

## Table of Contents

1. [What This Tool Does](#what-this-tool-does)
2. [Quick Start](#quick-start)
3. [Interface Overview](#interface-overview)
4. [Built-in Data Mode](#built-in-data-mode)
5. [Upload Your Own Data](#upload-your-own-data)
6. [Understanding the Map View](#understanding-the-map-view)
7. [Filters and Controls](#filters-and-controls)
8. [Timeline and Playback](#timeline-and-playback)
9. [Heatmaps](#heatmaps)
10. [Human vs Bot Data](#human-vs-bot-data)
11. [Reading the Insights](#reading-the-insights)
12. [Expected Data Schema](#expected-data-schema)
13. [Coordinate Mapping](#coordinate-mapping)
14. [Troubleshooting](#troubleshooting)
15. [Running Locally](#running-locally)
16. [FAQ](#faq)

---

## What This Tool Does

LILA BLACK generates thousands of gameplay events per match — player positions, kills, deaths, loot pickups, and storm deaths. This tool takes that raw data and puts it on a map so you can actually see what's happening.

**Without this tool:** 2–3 hours of manual data wrangling to identify a kill hotspot.  
**With this tool:** Under 30 seconds.

**Key capabilities:**
- See where players move, fight, loot, and die — on the actual minimap
- Watch a match unfold in real time using the timeline playback
- Toggle heatmaps to see kill zones, death zones, or high-traffic areas
- Separate human player behavior from bot behavior
- Filter by map, date, and individual match
- Upload your own parquet data files for custom analysis

---

## Quick Start

1. **Open the tool** — navigate to the hosted URL
2. **Select a map** — click AmbroseValley, GrandRift, or Lockdown in the header tabs
3. **Select a date** — use the Date dropdown in the left panel
4. **Select a match** — use the Match dropdown (or leave on "Full Day Aggregate" to see all matches)
5. **Read the map** — player paths appear as colored lines, events as colored dots
6. **Enable heatmap** — toggle "Show Density Heatmap" and select Kill / Death / Movement to see concentration zones

That's it. Everything else is optional filtering.

---

## Interface Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER — Map tabs (AmbroseValley / GrandRift / Lockdown)           │
│           Mode tabs (Built-in Data / Upload Data)                   │
├──────────────────────┬──────────────────────────────────────────────┤
│  FILTER PANEL        │  MAP VIEW                                    │
│  (left side)         │  (main area — ~75% of screen)               │
│                      │                                              │
│  • Location          │  Minimap image as background                │
│  • Temporal Scan     │  Player path lines on top                   │
│  • Patch Focus       │  Event markers (dots) on top                │
│  • Player Segment    │  Heatmap overlay (if enabled)               │
│  • Visual Layers     │                                              │
│  • Event Filters     │  [Zoom controls — top right]                │
│  • Stats Summary     │  [Legend — bottom right]                    │
│                      │                                              │
├──────────────────────┴──────────────────────────────────────────────┤
│  TIMELINE — Play/Pause · Scrubber · Speed (1× / 2× / 4×)           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Built-in Data Mode

The default mode. Uses the pre-processed 5-day production dataset for LILA BLACK across all three maps.

**Available filters in this mode:**
- **Location** — Select the map: AmbroseValley, GrandRift, or Lockdown
- **Temporal Scan (Date)** — Filter to a specific day in the dataset
- **Patch Focus (Match)** — Select a specific match ID, or use "Full Day Aggregate" to see all matches for that date combined

**Aggregate vs single match:**
- **Full Day Aggregate** — Shows combined data from all matches on the selected date. Best for heatmaps and identifying map-wide patterns.
- **Single match** — Shows one match in detail. Required for timeline playback. Best for understanding how a specific match unfolded.

---

## Upload Your Own Data

Click **"↑ Upload Data"** in the header to switch to upload mode.

### How to upload

1. Click "Upload Data" tab in the header
2. Drag and drop your `.parquet` file(s) onto the upload zone, or click "Browse Files"
3. Also accepts `.zip` files containing parquet files — all parquet files inside the ZIP will be loaded
4. Wait for processing (a progress indicator shows each step)
5. The tool switches automatically to the map view once processing is complete

### What happens to your data

Everything is processed **entirely in your browser**. Your files are never sent to any server. When you close the tab, the data is gone.

### Multiple files

You can upload multiple parquet files at once — select them all in the file picker or drag them all at once. The tool merges them and treats them as one dataset.

### Returning to built-in data

Click **"Built-in Data"** in the header. Your uploaded data is cleared.

---

## Understanding the Map View

### The minimap

The background image is the actual game minimap for the selected map. All events are rendered on top of it at their exact in-game coordinates. If coordinates are mapping correctly, you should see paths following roads and buildings visible on the minimap.

### Toggle map on/off

Use the **"Show Map"** toggle in the Visual Layers section of the filter panel to turn the minimap background on or off. Turning it off shows only paths and markers on a black background — useful for seeing path density without visual noise from the map image.

### Player paths

Colored lines connecting a player's position events in chronological order.

| Line style | Meaning |
|---|---|
| Solid colored line | Human player |
| Dashed gray line | Bot player |

Each human player gets a unique color from an 8-color palette. When more than 8 humans are shown, colors repeat.

### Event markers

Colored dots placed at the exact location of each gameplay event.

| Color | Event | Dot size |
|---|---|---|
| 🔵 Blue | Kill — player eliminated someone | 8px |
| 🔴 Red | Death — player was eliminated | 8px |
| 🟢 Green | Loot — player picked up an item | 6px |
| 🟡 Yellow | Storm Death — player died in storm zone | 8px |

**Hover over any dot** to see a tooltip with: event type, player name, and timestamp (e.g. T+08:42).

### Zoom and pan

- **Scroll wheel** — zoom in/out
- **Click and drag** — pan around the map
- **+ / − buttons** (top right of map) — step zoom
- **↺ button** — reset to default zoom and pan

### Legend

Always visible in the bottom right corner of the map. Shows the color encoding for all event types and the human/bot path distinction.

---

## Filters and Controls

All filters are in the left panel. Every filter applies immediately — no Apply button.

### Location (Map)

Selects which map to display. Also available as tabs in the header (AmbroseValley / GrandRift / Lockdown). Changing map resets the selected match and reloads data.

### Temporal Scan (Date)

Filters to a specific day in the dataset. The Match dropdown repopulates with matches available on that date.

### Patch Focus (Match)

| Selection | What you see |
|---|---|
| Full Day Aggregate | All matches combined for selected map + date |
| Specific match ID | Only that match's events |

In aggregate mode: timeline is disabled. Heatmaps and markers show patterns across all matches.  
In single-match mode: timeline is enabled. You can watch the match play out.

### Player Segment

| Option | What renders |
|---|---|
| ALL | Both human and bot players |
| HUMAN | Human players only (recommended for design analysis) |
| BOT | Bot players only |

**Recommendation:** Use HUMAN for all design analysis. Bots follow scripted paths that do not reflect real player behavior. Bot movement inflates edge-of-map traffic and skews heatmaps.

### Visual Layers

Three independent toggles:

| Toggle | Controls |
|---|---|
| Show Map | Minimap PNG background on/off |
| Show Paths | Player movement path lines on/off |
| Show Event Markers | Kill/death/loot/storm dots on/off |
| Show Density Heatmap | Heatmap overlay on/off |

### Event Filters

Four checkboxes to show/hide individual event types. You can, for example, show only Storm Deaths (yellow) to isolate where players are dying to the storm.

---

## Timeline and Playback

The timeline bar at the bottom of the screen controls match time. **Only available when a specific match is selected** (not in aggregate mode).

### Scrubber

Click anywhere on the track to jump to that moment in the match. Drag the thumb to scrub forward or backward. All layers — paths, markers, and heatmap — update simultaneously to show only events that have occurred up to that point.

**What changes as you scrub:**
- Path lines draw progressively — you see where each player has been up to time T
- Event markers appear at the moment they happened
- Earlier markers stay visible (they don't disappear when you scrub past them)

### Playback

| Control | Action |
|---|---|
| ▶ Play | Start advancing time at real-time speed |
| ⏸ Pause | Stop at current position |
| 1× | Real-time (1 second per second) |
| 2× | Double speed |
| 4× | Quadruple speed |

**Tip:** Use 2× or 4× to quickly scan a full match (~20 minutes), then pause and scrub back to interesting moments.

### Timeline display

- Left label — current match time (e.g. T+08:42 = 8 minutes and 42 seconds since match start)
- Right label — total match duration
- Progress bar — proportion of match elapsed

---

## Heatmaps

Heatmaps show density — where events are concentrated across many players and many matches. They are most useful in **aggregate mode** (no match selected) where data from all matches is combined.

### Enable heatmap

Toggle **"Show Density Heatmap"** in the Visual Layers section. Then select a mode.

### Heatmap modes

| Mode | Source events | What it tells you |
|---|---|---|
| Kill Density | Kill events | Where players are eliminating others. Identify combat hotspots and potential choke points. |
| Death Density | Killed + KilledByStorm events | Where players are dying from all causes. Includes storm deaths. |
| Movement | Position events | Where players spend time and travel. Identifies popular routes, dead zones, and ignored areas. |

### Reading the color scale

```
Transparent → Yellow → Orange → Red
(low density)              (high density)
```

Areas with no color = very few or zero events occurred there.  
Red areas = extremely high concentration. Worth investigating.

### Heatmap + Player Segment interaction

Heatmaps respect the Player Segment filter. With **HUMAN** selected, you see only human-generated density. With **ALL**, bots are included. For design decisions, always use HUMAN.

---

## Human vs Bot Data

LILA BLACK matches include both human players and bot players. This tool automatically identifies bots and lets you filter them separately.

### How bots are identified

Any player whose user ID starts with `BOT_` is classified as a bot. This is deterministic — no guessing or ML involved.

### Why this matters

| Scenario | Human data | Bot data |
|---|---|---|
| Movement patterns | Organic — varies by player skill and strategy | Scripted — follows fixed pathfinding routes |
| Combat locations | Driven by loot, positioning, and encounter | Driven by bot targeting logic |
| Map edge traffic | Low — humans avoid edges with no loot | High — bots often path along map edges |
| Storm deaths | Reflect human decision-making errors | May not reflect realistic late-game behavior |

**Design decisions should always be based on human-only data.**

### Human / Bot split display

The stats panel at the bottom of the filter panel shows a Human / Bot split (e.g. "10 Human · 0 Bot") for the current filter selection.

---

## Reading the Insights

The tool surfaces three pre-analyzed insights derived from the production dataset. Access them from the **Insights panel** (if available in your deployment).

Each insight follows this structure:

- **Observation** — what the data shows
- **Evidence** — specific stats, coordinates, match IDs
- **Interpretation** — why this matters for map design
- **Actionable recommendation** — what to change and what metric to watch
- **Confidence level** — how many matches and days the pattern was observed across

Use the tool to reproduce each insight yourself:
1. Follow the "How to reproduce" steps at the end of each insight
2. Verify the pattern in the map view before using it in a design meeting
3. After a map patch, re-run the same steps and compare — did the pattern change?

---

## Expected Data Schema

If you are uploading your own data, your parquet files must contain these columns:

| Column | Type | Required | Description |
|---|---|---|---|
| `match_id` | string | Yes | Unique identifier grouping all events in one match |
| `user_id` | string | Yes | Player identifier. Bot players must start with `BOT_` prefix |
| `ts` | int64 | Yes | Timestamp in **milliseconds since match start** — NOT Unix time |
| `event` | bytes or string | Yes | Event type — see values below |
| `x` | float | Yes | World X coordinate (east-west axis) |
| `z` | float | Yes | World Z coordinate (north-south axis) — note: NOT `y` |
| `map` | string | No | Map name — required if using built-in coordinate mapping |
| `date` | string | No | Date string — used for date filter. Auto-extracted from file path if absent |

### Event type values

The `event` field must decode to one of these strings:

| Value | Meaning |
|---|---|
| `Kill` | This player eliminated another player |
| `Killed` | This player was eliminated |
| `Loot` | This player picked up an item |
| `KilledByStorm` | This player died in the storm zone |
| `Position` | Position update — used to draw movement paths |

> **Note:** The `event` field is stored as bytes in the parquet file. The tool automatically decodes it to UTF-8. If your events use different string values, the tool will log them to the browser console and skip them.

### Timestamp format

`ts` must be **milliseconds elapsed since the start of the match** — not a Unix timestamp. Typical values range from `0` to `~1,200,000` (20 minutes in ms). If your timestamps are Unix epoch values (13-digit numbers like `1706745600000`), you need to subtract the match start time before uploading.

---

## Coordinate Mapping

The game world uses a coordinate system where X = east-west and Z = north-south. The minimap image uses screen coordinates where (0,0) is the top-left. These are different, and the conversion requires per-map parameters.

### Built-in maps

AmbroseValley, GrandRift, and Lockdown all have their coordinate parameters pre-configured. No setup needed.

### Unknown or custom maps

If you upload data for a map the tool doesn't recognize, it will show a **Coordinate Configuration screen** asking for:

| Parameter | What it means | Where to find it |
|---|---|---|
| Origin X | World X coordinate of the map's west edge | Game README or map metadata |
| Origin Z | World Z coordinate of the map's south edge | Game README or map metadata |
| Scale | World units per pixel (how many world units fit across the 1024px image) | Game README or map metadata |
| Minimap PNG | The map image file (1024×1024 pixels recommended) | Your game's assets |

### The mapping formula

```
pixel_x = (world_x - origin_x) / scale × 1024
pixel_y = (1 - (world_z - origin_z) / scale) × 1024
```

The `(1 - ...)` in the Y formula is a Y-axis flip. Game world Z increases northward (up), but image Y increases downward — without the flip, the map renders upside down.

### Validating your mapping

After uploading, check that:
1. Path lines follow roads and travel corridors visible on the minimap
2. Kill markers appear near buildings and intersections, not in empty terrain
3. Storm death markers appear near the storm boundary, not at random positions

If markers appear in wrong locations, your origin or scale values are incorrect.

---

## Troubleshooting

### Map image not showing — paths visible but on black background

The minimap PNG is not loading. Check:
1. Open browser DevTools (F12) → Network tab → look for the minimap PNG request
2. If it shows 404: the file is missing from `/static/minimaps/`
3. If it shows 200 but map still black: toggle "Show Map" in the filter panel — it may be switched off

### Kill / Death / Storm markers not appearing — only Loot is visible

Event type string mismatch. Open browser DevTools → Console tab and look for:
```
All event types in data: [...]
```
If you see values like `'Elimination'` or `'kill'` (lowercase) instead of `'Kill'`, the event strings in your data differ from the expected values. Contact your data pipeline team to check the event encoding.

### Heatmap shows Movement but not Kill or Death

The kill/death heatmap grids computed to all-zeros, which means the `Kill` or `Killed` events were not found during processing. Same as above — check event string values. Re-run `process.py` after correcting event strings.

### "No parquet files found" error on ZIP upload

Your ZIP was processed but no `.parquet` files were found inside it. Open DevTools → Console — it will list every file found in the ZIP. Common causes:
- Files have a different extension (`.parq`, no extension)
- Parquet files are nested more than one level deep inside subdirectories
- The ZIP contains only a folder, not files directly

### "Missing required columns" error on upload

Your parquet schema is missing one or more required fields. The error message lists exactly which columns are missing. The most common missing columns are `z` (if your data uses `y` for the vertical axis) and `ts` (if your timestamps are named `timestamp` or `time`).

### Paths look correct but are misaligned with the map image

Coordinate mapping parameters are wrong. For uploaded custom maps, re-check your Origin X, Origin Z, and Scale values. For built-in maps, report this as a bug.

### Timeline scrubbing is laggy

You have a very large match selected (many players, many events). Try:
1. Switch Player Segment to HUMAN ONLY — removes bot position events
2. Disable Show Paths — path rendering is the most expensive operation
3. Use a shorter match (filter to a match with fewer players)

### Tool is slow to load on first open

The JSON data files are loading from the server. Normal load time is 1–3 seconds. If it's taking longer, check your network connection. The tool does not load any data until you select a map and date.

---

## Running Locally

### Prerequisites

- Node.js 18 or higher
- npm 8 or higher
- Python 3.10 or higher (for data pipeline only)

### Setup

```bash
# Clone the repository
git clone [repo-url]
cd lila-maps

# Install frontend dependencies
npm install

# Install Python dependencies (for data pipeline)
pip install pyarrow pandas numpy scipy
```

### Run the data pipeline

Only needed once, or when you have new parquet data.

```bash
# Copy your parquet files into player_data/
# Copy your minimap PNGs into static/minimaps/
# Run the pipeline
python process.py

# Output: static/*.json files (events and heatmaps per map per date)
```

### Run the development server

```bash
npm run dev
# Tool is now available at http://localhost:3000
```

### Build for production

```bash
npm run build
npm run preview  # preview the production build locally
```

### Deploy

```bash
# Deploy to Antigravity
antigravity deploy

# Or deploy to Vercel
vercel --prod
```

---

## FAQ

**Q: Why does the tool only show human data by default?**  
Bot behavior is scripted and does not reflect real player decision-making. Showing bot data by default would make heatmaps and path patterns misleading for design decisions. You can switch to "ALL" or "BOT" at any time in the Player Segment filter.

**Q: What does "Full Day Aggregate" mean?**  
It combines all matches from the selected map and date into one view. Individual paths are shown for all matches simultaneously, and heatmaps represent density across all matches. Use this when you want to identify map-wide patterns rather than single-match stories.

**Q: The timeline says T+0:00 and won't play. Why?**  
The timeline only works when a specific match is selected. In "Full Day Aggregate" mode, the timeline is disabled because there is no single match timeline to play back. Select a match ID from the dropdown.

**Q: Can I compare two matches side by side?**  
Not in this version. Select one match at a time. To compare, open the tool in two browser tabs and load a different match in each.

**Q: My uploaded data has a "date" column but the date filter isn't working.**  
The date filter reads from the `date` column if present. Make sure the values are consistent strings (e.g. `"2025-01-03"` not `"January 3"` or a Unix timestamp). If the column is missing, all uploaded data is grouped under a single "Uploaded" date entry.

**Q: I uploaded data for a custom map but the coordinate config screen asks for Origin X/Z/Scale. Where do I find these?**  
These come from your game engine's map definition files or README. Origin X and Origin Z are the world coordinates of the southwest corner of the playable area. Scale is how many world units correspond to the full width of the minimap image. Check your game's internal documentation or ask an engineer who works on the map systems.

**Q: How are heatmaps computed for uploaded data?**  
For uploaded data, heatmaps are computed client-side in the browser using a grid-based density approach. The map is divided into a 64×64 grid, events are counted per cell, and a Gaussian smoothing pass is applied. This is slightly less precise than the offline KDE heatmaps used for built-in data, but produces comparable results for design analysis.

**Q: Why is the tool desktop-only?**  
The primary users are Level Designers working at a desktop workstation. The map view requires substantial screen real estate to be useful — a 1440px wide screen is the target. A read-only mobile view is planned for a future version.

**Q: Is my uploaded data stored anywhere?**  
No. Everything processes in your browser memory. Nothing is sent to any server. When you close the tab or click "Clear Upload," the data is gone.

---

## Color Reference

| Color | Hex | Use |
|---|---|---|
| Cyan | `#00C8FF` | Interactive elements, active filters, timeline |
| Blue | `#3B82F6` | Kill events everywhere |
| Red | `#EF4444` | Death events everywhere |
| Green | `#22C55E` | Loot events everywhere |
| Yellow | `#FACC15` | Storm death events everywhere |
| Gray dashed | `#4B5563` | Bot player paths |

These colors are consistent across every surface in the tool — markers, heatmaps, legends, tooltips, and stats cards. If you see blue, it means kill. Always.

---

*LILA BLACK Player Journey Visualization Tool · Internal Tool · LILA Games*  
*For issues, contact the Product team or open a ticket in the internal tracker.*
