# Product Requirements Document
## Player Journey Visualization Tool — LILA BLACK
**Version:** 2.0 (Final)
**Author:** APM Candidate
**Status:** Ready for Submission
**Platform:** Antigravity (Web)

---

## 0. One-Line System Statement

> A browser-based map intelligence tool that converts raw LILA BLACK telemetry into spatial, time-aware visualizations — enabling level designers to identify player behavior patterns in under 30 seconds, without writing a single query.

---

## 1. Executive Summary

### The Problem

LILA BLACK's Level Design team works blind. They have 5 days of production telemetry across three maps — AmbroseValley, GrandRift, and Lockdown — but no way to interpret it spatially. Every map revision decision is made from instinct, or from hours of manual data wrangling that produces tables instead of pictures.

With LILA BLACK's player base growing and mixed human-bot match environments becoming the norm, this approach no longer scales. A designer who needs 3 hours to identify a kill hotspot cannot iterate fast enough to keep pace with live operations.

### Why Now

Three converging pressures make this the right moment to build:
1. **Scale:** 5 days of data = thousands of matches. Manual analysis is not just slow — it's now impossible to do comprehensively.
2. **Bot complexity:** Mixed human-bot lobbies mean raw aggregates are misleading. A tool that doesn't separate them produces wrong answers, not slow ones.
3. **Design velocity:** Shipping competitive maps requires sub-week iteration cycles. The current analysis pipeline is a 2–4 hour tax on every design decision.

### The Solution

A web-based visualization tool that maps raw telemetry onto the actual minimap image — with real-time filtering, timeline playback, and pre-computed heatmaps. A designer opens it, selects a match, and has a spatially accurate picture of player behavior in under 30 seconds.

> **The map occupies ~75% of screen real estate to prioritize spatial cognition over control density. Designers think in space, not spreadsheets — the tool is designed around that mental model.**

---

## 2. Problem Definition

### 2.1 Current State — Quantified

| Workflow | How It Works Today | Time Cost |
|---|---|---|
| Identify kill hotspot on a map | Aggregate coordinates in pandas, no map overlay | 2–3 hours |
| Compare human vs bot movement | Manual user_id inspection + separate analysis | Not reliably possible |
| Understand match timeline | Manually sort events by timestamp, read row by row | 45–90 min per match |
| Detect underutilized map areas | No process exists | Impossible today |
| Prepare evidence for design meeting | Export CSV, describe findings in words | 4+ hours per meeting |

### 2.2 The Three Core Pain Points

**Pain Point 1 — No spatial context**
Telemetry coordinates (`x`, `z` in world space) are meaningless without the minimap. A coordinate like `(14230, -8820)` tells a designer nothing. They cannot iterate on what they cannot see.

**Pain Point 2 — No temporal context**
Events have timestamps but no playback. Designers cannot watch a match unfold — they can only see the static end-state. They miss that a choke point is lethal in minute 8 specifically because of storm timing.

**Pain Point 3 — Bot contamination**
Mixed human-bot lobbies contaminate every aggregate. Bot movement follows scripted paths that inflate edge-of-map traffic. Bot deaths skew storm-death counts. Any heatmap that includes bots without flagging them produces misleading design signals.

---

## 3. Goals and Non-Goals

### 3.1 Goals

| Goal | Metric | Target |
|---|---|---|
| Speed to first insight | Time from tool open to actionable finding | < 30 seconds |
| Coordinate accuracy | Pixel mapping error on 1024×1024 minimap | < 5px |
| Data coverage | % of parquet events renderable | > 95% |
| Bot classification accuracy | Correct human/bot split | 100% (deterministic rule) |
| Initial load performance | Time to first interactive state | < 3 seconds |
| Filter responsiveness | Latency on any filter change | < 200ms |
| Cross-map support | Maps fully supported | All 3 (AmbroseValley, GrandRift, Lockdown) |

### 3.2 Non-Goals (Explicitly Out of Scope)

- Real-time data streaming
- ML-based player segmentation or prediction
- Authentication or access control
- Multi-user collaboration or annotation
- Mobile layout optimization
- Economy, progression, or inventory analysis
- Video export of playback sessions

---

## 4. User Personas

### Primary — Alex (Senior Level Designer)

| Attribute | Detail |
|---|---|
| Experience | 5+ years, shipped 3 maps on LILA BLACK |
| Technical skill | Moderate — Excel, basic SQL. Not a programmer. |
| Mental model | Thinks spatially. Says "north warehouse," not coordinates. |
| Core frustration | "I know something is wrong with the GrandRift center corridor — I just can't prove it." |
| Session pattern | Opens tool during active design work. Needs answers in under a minute. |

**What Alex needs:**
- See the map, not a spreadsheet
- Find the problem zone before the coffee gets cold
- Show colleagues the pattern, not just describe it in words
- Filter to specific matches to isolate design variables

**What Alex cannot tolerate:**
- Configuring a data pipeline before using the tool
- Bot data silently contaminating human behavior analysis
- 500ms+ latency on filter changes
- Unlabeled color scales or cryptic legends

### Secondary — Priya (Game Director)

**Need:** 5-minute high-level overview before map revision meetings. Wants: "Which map is most lethal this week? Where's the problem?" Not interested in per-match playback.

---

## 5. Data Model and Schema

### 5.1 Source Data Properties

| Property | Value |
|---|---|
| Format | Apache Parquet |
| Coverage | 5 days of production gameplay |
| Maps | AmbroseValley, GrandRift, Lockdown |
| Processing | Offline Python pipeline (before deployment) |

### 5.2 Field Reference

| Field | Type | Notes |
|---|---|---|
| `match_id` | string | Groups all events in one match |
| `user_id` | string | Player identifier. Bot detection applied here. |
| `ts` | int64 | Milliseconds since match start (NOT Unix timestamp) |
| `event` | bytes | Must be decoded to UTF-8 string before use |
| `x` | float | World X coordinate (east-west) |
| `z` | float | World Z coordinate (north-south). Note: NOT `y`. |
| `map` | string | `AmbroseValley`, `GrandRift`, or `Lockdown` |

### 5.3 Event Decoding

The `event` field is stored as raw bytes. Decode to UTF-8 string before any use.

```python
df['event'] = df['event'].apply(
    lambda b: b.decode('utf-8') if isinstance(b, bytes) else str(b)
)
```

**Event type reference after decoding:**

| Decoded Value | Meaning | Rendered As |
|---|---|---|
| `Kill` | Player eliminated another player | Blue marker (●) |
| `Killed` | Player was eliminated | Red marker (●) |
| `Loot` | Player picked up an item | Green marker (●) |
| `KilledByStorm` | Player died in storm zone | Yellow marker (●) |
| `Position` | Position update (path point) | Path line only — no marker |

> **Counting note:** One PvP elimination creates both a `Kill` (attacker) and a `Killed` (victim) event at near-identical coordinates. Count only `Kill` events for elimination totals to avoid double-counting.

### 5.4 Bot Detection — Exact Rule

```python
df['is_bot'] = df['user_id'].str.startswith('BOT_')  # case-sensitive
df['player_type'] = df['is_bot'].map({True: 'bot', False: 'human'})
```

**Why exact rule matters:** Bot `Position` events follow scripted pathfinding — tight, repetitive, edge-hugging routes. Including them in movement heatmaps makes map edges appear heavily traveled when they are not. All heatmaps default to human-only data.

**Sanity check:** If any match shows >80% bot ratio, flag it in the UI as a "bot-heavy match" — likely a stress test or QA session, not representative player behavior.

### 5.5 Coordinate Mapping

**The core challenge:** Game world Z increases northward (up on map), but image pixel Y increases downward. A naive mapping produces a vertically mirrored result. The Y-flip is mandatory.

**Formula:**
```
u        = (world_x - origin_x) / scale
v        = (world_z - origin_z) / scale
pixel_x  = u × 1024
pixel_y  = (1 - v) × 1024    ← Y-flip: (1-v) corrects the inversion
```

**Per-map config** (read from README, stored in a named config object per map — never hardcoded inline):

| Map | `origin_x` | `origin_z` | `scale` |
|---|---|---|---|
| AmbroseValley | *(from README)* | *(from README)* | *(from README)* |
| GrandRift | *(from README)* | *(from README)* | *(from README)* |
| Lockdown | *(from README)* | *(from README)* | *(from README)* |

**Validation protocol:** Before shipping, verify mapping against ≥3 landmark coordinates per map. Confirm out-of-bounds pixel rate is <5% of all events.

---

## 6. Feature Specifications (MoSCoW)

### 6.1 [MUST] Map Display and Selection

Minimap image displayed as canvas background. All events rendered on top are spatially accurate to the correct map.

**Acceptance criteria:**
- All 3 maps selectable; minimap and coordinate config switch automatically
- No stretching or distortion of minimap image
- Empty state message when no data exists for a filter combination

### 6.2 [MUST] Player Path Visualization

Sequential `Position` events connected per player, per match, in timestamp order.

**Visual encoding:**

| Player type | Line style | Color |
|---|---|---|
| Human | Solid, 2px | Per-player palette (8 distinct colors) |
| Bot | Dashed `6 3`, 2px | Desaturated gray (#4B5563) |

**Performance rule:** Maximum 100 position events per player (uniform sampling). Prevents rendering lag on high-player-count matches.

**Acceptance criteria:**
- Human and bot paths visually distinguishable at a glance
- Toggling "Show Paths" responds within 200ms
- Paths are chronologically correct (never jumps backward in time)

### 6.3 [MUST] Event Markers

| Event | Color | Diameter | Tooltip |
|---|---|---|---|
| Kill | #3B82F6 Blue | 8px | "Kill — [user] — T+[ss]" |
| Killed | #EF4444 Red | 8px | "Killed — [user] — T+[ss]" |
| Loot | #22C55E Green | 6px | "Loot — [user] — T+[ss]" |
| KilledByStorm | #FACC15 Yellow | 8px | "Storm Death — [user] — T+[ss]" |

Tooltip appears on hover with 150ms delay. Each event type independently toggleable.

### 6.4 [MUST] Filter Panel

**Filters:**

| Filter | Behavior |
|---|---|
| Map | Single-select. Changes minimap image + repopulates match list. |
| Date | Single-select from 5 available dates. |
| Match ID | Single-select from matches for selected map + date. If none selected: aggregate view. |
| Player type | Toggle: All / Humans Only / Bots Only. Affects all layers simultaneously. |
| Event types | Multi-select checkboxes: Kill, Death, Loot, Storm Death. |
| Layer visibility | Toggle switches: Paths, Markers, Heatmap. |

All filters apply immediately — no "Apply" button. Filter state persists via URL parameters.

### 6.5 [MUST] Timeline / Playback

Slider at bottom of screen. Dragging to time T shows only events where `event.ts ≤ T`.

- Paths draw progressively as time advances (not all-at-once)
- Display: "T+MM:SS" label above slider
- Playback modes: 1× real-time, 2× speed, Pause
- Timeline disabled in aggregate view (no match selected)

**Acceptance criteria:**
- Slider drag re-renders within 300ms
- All three layers (paths, markers, heatmap) respond to timeline simultaneously
- Play button advances at correct real-time pace

### 6.6 [MUST] Heatmap Overlays

Three toggleable density modes. Only one active at a time.

| Mode | Source events | What it reveals |
|---|---|---|
| Kill Heatmap | `Kill` events | Where players eliminate others most often |
| Death Heatmap | `Killed` + `KilledByStorm` | Where players die (combat + storm combined) |
| Movement Heatmap | `Position` events | Where players spend time / travel |

**Rendering:** 64×64 density grid, Gaussian-smoothed (σ=2 cells), normalized 0–1. Color: transparent → yellow → orange → red. Overlay at 65% opacity.

**Filter interaction:** Heatmaps respect player type filter. Human-only heatmap is the default and the design-relevant view.

### 6.7 [MUST] Human vs Bot Visual Distinction

| Layer | Human | Bot |
|---|---|---|
| Paths | Solid, colored | Dashed, gray |
| Markers | Full opacity | 40% opacity, gray tint |
| Heatmap | Default view | Requires explicit toggle to include |

### 6.8 [SHOULD] Match Summary Stats

Collapsible panel showing: total players (human/bot), total kills (human-on-human), storm deaths, match duration, most lethal 100m² zone coordinates.

### 6.9 [SHOULD] Zoom and Pan

Scroll-to-zoom (0.5× to 8×), click-drag-to-pan. Marker size stays constant at all zoom levels. Reset View button.

### 6.10 [COULD] Player Isolation

Click a path to highlight that player's full journey, dim all others to 10% opacity. Escape to deselect.

### 6.11 [WON'T] Deferred

Automated insight generation, video export, multi-user collaboration, real-time streaming, mobile layout.

---

## 7. User Flows

### Flow 1: Find the Kill Hotspot (Target: <45 seconds)

```
Open tool → default map loaded
→ Select Map: GrandRift
→ Select Date: most recent
→ Enable Heatmap → Kill Heatmap
→ Toggle: Humans Only
→ Red cluster visible on minimap
→ Hover → coordinate tooltip
→ Insight: "North bridge = primary kill zone"
```

### Flow 2: Replay a Match (Target: <2 minutes to reach key moment)

```
Select Map + Date + Match ID
→ Enable Paths + Markers
→ Press Play
→ Watch paths draw, markers appear at timestamps
→ Pause at T+5:00 — observe early-game landing
→ Advance to T+15:00 — observe storm forcing movement
→ Yellow storm-death markers cluster at storm edge
```

### Flow 3: Verify Bot Contamination (Target: <2 minutes)

```
Select Map + Date (no match filter = aggregate)
→ Enable Movement Heatmap
→ Player Type: ALL → observe
→ Player Type: Humans Only → observe
→ If difference is significant → bot routing is a confound
→ All future design analysis done with Humans Only
```

---

## 8. UX and Design System

### 8.1 Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER (48px) — Tool name, Map selector, global controls    │
├────────────────────┬────────────────────────────────────────┤
│ FILTER PANEL       │ MAP VIEW (~75% screen width)           │
│ (280px fixed)      │                                        │
│                    │ [Minimap — base layer]                 │
│ • Date             │ [Heatmap overlay]                      │
│ • Match            │ [Path lines]                           │
│ • Player type      │ [Event markers]                        │
│ • Event toggles    │                                        │
│ • Layer toggles    │ [Zoom/Pan — top right]                 │
│ • Color legend     │ [Legend — bottom right]                │
│ • Stats summary    │                                        │
├────────────────────┴────────────────────────────────────────┤
│ TIMELINE (64px) — Slider + playback controls + time label   │
└─────────────────────────────────────────────────────────────┘
```

> The map occupies ~75% of screen real estate. This is a deliberate product decision: level designers reason spatially. Controls are secondary surfaces that support the map, not compete with it.

### 8.2 Color System

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | #0B0F14 | App background |
| `--bg-panel` | #121821 | Filter panel surface |
| `--border` | #1F2A36 | All borders |
| `--event-kill` | #3B82F6 | Kill markers, kill heatmap |
| `--event-death` | #EF4444 | Death markers |
| `--event-loot` | #22C55E | Loot markers |
| `--event-storm` | #FACC15 | Storm death markers |
| `--path-bot` | #4B5563 | Bot path lines |
| `--text-primary` | #E5E7EB | Primary text |
| `--text-secondary` | #9CA3AF | Labels, captions |

### 8.3 Interaction Principles

- **Map first:** 75% screen width. Controls are secondary.
- **Consistent encoding:** Kill = Blue everywhere — marker, legend, tooltip, stats. No exceptions.
- **No loading states on filter changes:** All filtering is in-memory. Data is pre-loaded.
- **Legend always visible:** Color legend anchored to bottom of filter panel. Never hidden or collapsed.
- **Progressive disclosure:** Default view = paths + markers. Heatmap requires explicit enable. Protects cognitive load for new users.

---

## 9. Success Metrics

### 9.1 Speed

| Task | Today (manual) | Target (with tool) |
|---|---|---|
| Identify kill hotspot | 2–3 hours | < 45 seconds |
| Compare bot vs human movement | Not possible | < 2 minutes |
| Prepare map evidence for meeting | 4+ hours | < 15 minutes |

### 9.2 Technical Performance

| Metric | Target |
|---|---|
| Initial load | < 3 seconds |
| Filter response | < 200ms |
| Timeline scrub | < 300ms |
| Heatmap mode switch | < 500ms |
| Coordinate accuracy | < 5px error |

### 9.3 Data Quality

| Metric | Target |
|---|---|
| Events decoded successfully | > 99% |
| Events within map bounds | > 95% |
| Bot classification accuracy | 100% (deterministic) |

---

## 10. Assumptions and Open Questions

### 10.1 Documented Assumptions

| Assumption | Risk if Wrong | Validation Method |
|---|---|---|
| `BOT_` prefix is complete and sole bot identifier | Contaminated heatmaps | Cross-check distinct user_id prefixes in data |
| `ts` is match-relative milliseconds (not Unix) | Wrong timeline duration | Verify: values start near 0, max ~1200000 (20 min) |
| Minimap images are 1024×1024px | Pixel formula produces wrong output | Check actual image dimensions |
| `Position` events fire ≥1 per 2 seconds | Jagged, disconnected paths | Check avg position event frequency per player |
| All matches on same map use same coordinate space | Some matches render in wrong position | Validate edge events across multiple match IDs |

### 10.2 Open Questions (Resolve on Data Receipt)

1. What is the exact coordinate range per map? (Needed to set boundary clamps)
2. Are there event types beyond the 5 documented? (Run `df['event'].value_counts()`)
3. What is median match duration? (Informs timeline slider UX)
4. How many matches per map per day? (Dropdown vs search for match selector)
5. Are there incomplete matches with data gaps?

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Coordinate mapping wrong for a map | Medium | High | 3-point landmark validation before shipping |
| Too many events crash browser | Low | High | Cap at 10,000 rendered events per layer with warning |
| Event byte decode fails for edge cases | Low | Medium | try/catch with fallback string; log failures |
| Bot detection misses variants | Low | Medium | Inspect false negatives in sample match |
| KDE heatmap computation too slow in browser | Medium | Medium | Pre-compute in Python offline pipeline |

---

## Appendix: Definition of Done

A feature is complete when:
1. Renders correctly on Chrome (primary) and Firefox (secondary)
2. Handles empty/null data states without crashing
3. Respects player type filter on every layer
4. Has visible legend explaining color/shape encoding
5. Introduces no visual regression in other features
