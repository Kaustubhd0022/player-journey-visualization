# LILA BLACK — AI Enabled Player Journey Visualization Tool

> A browser-based map intelligence tool that transforms raw gameplay telemetry into spatial, time-aware visualizations. Built for Level Designers at LILA Games. Now featuring **AXIOM — Design Intelligence Assistant**.

---

## Table of Contents

1. [What This Tool Does](#what-this-tool-does)
2. [Quick Start](#quick-start)
3. [Interface Overview](#interface-overview)
4. [AXIOM — AI Assistant](#axiom--ai-assistant)
5. [Built-in Data Mode](#built-in-data-mode)
6. [Upload Your Own Data](#upload-your-own-data)
7. [Understanding the Map View](#understanding-the-map-view)
8. [Filters and Controls](#filters-and-controls)
9. [Timeline and Playback](#timeline-and-playback)
10. [Heatmaps](#heatmaps)
11. [Human vs Bot Data](#human-vs-bot-data)
12. [Expected Data Schema](#expected-data-schema)
13. [Coordinate Mapping](#coordinate-mapping)
14. [Troubleshooting](#troubleshooting)
15. [Running Locally](#running-locally)

---

## What This Tool Does

LILA BLACK transforms large-scale gameplay telemetry into tactical spatial insights. It processes thousands of events per match — player positions, kills, deaths, loot pickups, and storm deaths — rendering them into an interactive map for deep design analysis.

**Key capabilities:**
- **Spatial Visuals:** Watch player paths and combat events on the actual game minimap.
- **Time-Awareness:** Replay matches in real-time with granular timeline controls.
- **Heatmap Intelligence:** Identify kill hotspots, dead zones, and high-traffic corridors.
- **Human vs Bot:** Isolate human behavior to ensure design decisions are based on real player data.
- **AXIOM AI:** Get on-demand tactical insights and design recommendations from a context-aware AI.

---

## Quick Start

1. **Open the tool** — navigate to the hosted URL.
2. **Select a map** — use the tabs in the header (AmbroseValley, GrandRift, or Lockdown).
3. **Select a dataset** — use "Built-in Data" or "Upload Data".
4. **Enable AXIOM** — click the **✦ AXIOM** button in the header or enable it in the Filter Panel.
5. **Analyze** — watch player paths, toggle heatmaps, and ask AXIOM for spatial trends.

---

## Interface Overview

```
┌─────────────────────────────────────────────────────────────┬───────────┐
│  HEADER — Map Selection · Data Mode · AXIOM Toggle          │  [Date]   │
├──────────────────────┬──────────────────────────────────────┴───────────┤
│  FILTER PANEL        │  MAP VIEW                                        │
│  (left side)         │  (main area)                                     │
│                      │                                                  │
│  • Location          │  • Minimap background                            │
│  • Temporal Scan     │  • Player path lines                             │
│  • Match Focus       │  • Event markers (dots)                          │
│  • Player Segment    │  • Heatmap overlay                               │
│  • Visual Layers     │                                                  │
│  • Event Filters     │  [Zoom & Legend controls]                        │
│  • AI Assistant      │                                                  │
│  • Stats Summary     │                                                  │
├──────────────────────┴──────────────────────┬───────────────────────────┤
│  TIMELINE — Play/Pause · Scrubber · Speed   │  AXIOM PANEL (Right Side) │
└─────────────────────────────────────────────┴───────────────────────────┘
```

---

## AXIOM — AI Assistant

AXIOM is a design intelligence assistant powered by Anthropic's Claude (via Groq). It is deeply integrated with the tool's state and understands exactly what you are looking at.

### Capabilities
- **Spatial Trends:** "Where are players dying most frequently in AmbroseValley?"
- **Tactical Hotspots:** "Identify combat choke points for human players."
- **Level Balance:** "Which areas are being ignored by players in this match?"
- **Context-Aware:** AXIOM knows your active map, filters, and heatmap mode.

### Controls & Passivity
- **Manual Toggle:** AXIOM is strictly **reactive**. It only speaks when you ask.
- **Kill Switch:** Completely disable/hide the AI assistant from the "AI ASSISTANT" section in the Filter Panel.
- **Direct Link:** Opening the AXIOM panel gives you a tactical briefing on the currently visible data.

---

## Upload Your Own Data

Click **"↑ Upload Data"** in the header to switch modes.

### Improved Match Identification
The processor now handles `.parquet` and `.zip` files with enhanced filtering:
- **Filename Persistence:** If your data lacks an internal `match_id`, the tool automatically uses the **filename** as the match ID.
- **Individual Focus:** Uploading multiple files allows you to select each file individually in the "Match Focus" dropdown.
- **Zero Server Overhead:** All processing happens client-side using DuckDB-WASM and Apache Arrow.

---

## Expected Data Schema

If uploading custom data, ensure these columns exist:

| Column | Type | Description |
|---|---|---|
| `match_id` | string | Unique match identifier (optional if filename used) |
| `user_id` | string | Player ID (bots should start with `BOT_`) |
| `ts` | int64 | Milliseconds since match start |
| `event` | string | `Kill`, `Death`, `Loot`, `Position`, etc. |
| `x`, `z` | float | World coordinates (X=East/West, Z=North/South) |

---

## Running Locally

### Prerequisites
- Node.js 18+
- Groq API Key (for AXIOM)

### Setup
1. Clone the repo and run `npm install`.
2. Create a `.env` file in the root.
3. Add `VITE_GROQ_API_KEY=your_key_here`.
4. Run `npm run dev` to start the dashboard at `http://localhost:5173`.

---

*LILA BLACK Player Journey Visualization Tool · Internal Tool · LILA Games*
