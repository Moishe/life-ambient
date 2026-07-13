# Life Ambient Music — Design Spec

**Date:** 2026-07-13
**Status:** Approved pending user review

## Overview

A browser app that turns Conway's Game of Life into realtime ambient music. The user composes by placing known Life patterns (still lifes, oscillators, spaceships, guns) on a grid; the simulation's evolution generates the music. Each living cluster of cells is a sustained pad voice whose pitch, pan, timbre, and modulation are driven by the cluster's position, size, shape, and motion. Cell births add percussive sparkle. Deaths are silent — the music simply thins.

**Experience model:** pattern composer. The primary interaction is deliberately placing patterns from a curated palette to construct a soundscape, not free-painting or passive watching (though both are supported at the edges: single-cell paint for touch-ups, and long-running chaotic patterns for generative listening).

## Stack

- TypeScript, no UI framework, built with Vite
- Tone.js for all audio (synthesis, scheduling, effects)
- Canvas 2D for grid rendering
- Plain DOM for controls

## Architecture

Four modules with strict boundaries:

```
LifeEngine ──grid + diff──▶ ClusterTracker ──cluster events──▶ SoundMapper ──▶ Tone.js
     ▲                                                                            │
     └──────────────── UI (canvas + controls + pattern palette) ◀────────────────┘
```

- **LifeEngine** — pure simulation. No audio/DOM knowledge.
- **ClusterTracker** — pure analysis. Consumes grid state + diff, emits cluster lifecycle events with metrics.
- **SoundMapper** — owns all Tone.js objects. Consumes events, produces sound.
- **UI** — canvas renderer, pattern palette, transport/key controls.

The simulation ticks on Tone.js's Transport so audio events are sample-accurately scheduled. Tick rate is user-adjustable, 1–8 generations/sec.

## LifeEngine

- Bounded 96×96 grid, **no wraparound** (a torus would break the distance-from-center pitch metaphor when patterns teleport edge-to-edge). Cells outside the boundary are permanently dead.
- Standard Conway rules (B3/S23).
- `tick()` advances one generation and returns `{ grid, births: Cell[], deaths: Cell[] }`.
- API: `placePattern(pattern, x, y, rotation)`, `setCell(x, y, alive)`, `clear()`.

## ClusterTracker

### Grouping

Two live cells belong to the same cluster if they are within **Chebyshev distance 2** (one-cell gaps allowed). Computed per tick with a union-find pass. This keeps non-contiguous patterns (blinker phases, pulsar, a glider mid-flight) unified as one cluster while separating distinct islands.

### Identity over time

New clusters are matched to the previous tick's clusters by cell overlap, falling back to centroid proximity for fast movers. Outcomes:

- **Matched** → same cluster ID; pad continues; parameters glide to new values.
- **New, unmatched** → `cluster-born` event; a pad voice fades in.
- **Old, unmatched** → `cluster-died` event; pad releases (a fade — deaths are silent by design).
- **Merge** → larger cluster keeps its ID and voice; smaller one releases.
- **Split** → largest fragment keeps the ID; other fragments are born as new clusters.

### Per-cluster metrics (the modulation sources)

| Metric | Drives |
|---|---|
| Centroid distance from grid center | Pitch (scale degree) |
| Centroid X | Stereo pan |
| Cell count | Pad volume / detune richness |
| Bounding-box aspect ratio | Filter brightness |
| Cell-count delta per tick | Warble depth (filter + amplitude) |
| Centroid velocity | Slow vibrato |

Emergent voice taxonomy: still lifes → steady drones (zero deltas); oscillators → warbles at their natural period; spaceships → vibrato plus a moving pitch line; guns → perpetual ping arpeggios plus a stream of new voices.

## SoundMapper

### Pitch mapping

`(radialDistance, key, scale) → frequency`, in a small pure module. Radial distance from grid center maps across ~2 octaves of the selected scale — center is the root, outward rises. All pitches are quantized to the current key + scale. Scales: major pentatonic, minor pentatonic, lydian, dorian, whole-tone, aeolian. All 12 roots. Key/scale changes take effect on the next tick (existing voices glide to requantized pitches).

### Birth pings

- Tone.js metallic/FM synth: fast attack, quick decay, low velocity, heavy reverb send ("muted triangle").
- Pitch from the born cell's radial distance, two octaves above the pad register.
- **Micro-stagger:** births within one tick are spread across ~80 ms (a strum, not a hailstorm).
- **Cap:** max ~12 pings per tick; overflow births fold into one slightly louder ping.

### Cluster pads

- Voice pool, **max ~16 concurrent pads**. On exhaustion, smallest clusters are muted first; they resume if a slot frees while they still exist.
- Voice: 2 detuned saw/triangle oscillators → lowpass filter → slow envelope (attack ≈ 2 s, release ≈ 4 s).
- Pitch from centroid radial distance, quantized; changes glide (~200 ms portamento) so movers sing legato lines.
- Warble: cell-count delta modulates filter cutoff and amplitude lightly.
- Size: log-scaled volume and detune width.
- Pan from centroid X.

### Harmonic anchor

A very quiet drone (root + fifth, one octave below pad register) sounds whenever any cell is alive, so sparse boards still feel tonal.

### Mix safety

Every voice → gentle lowpass → shared long reverb (~8 s decay, high wet) → soft limiter on master. Master gain slowly ducks as total population rises. The board's population is unbounded; the output level is not.

## UI

### Layout

Canvas grid center; slim control bar; pattern palette sidebar.

### Pattern palette (curated, by musical role)

- **Drones** (still lifes): block, beehive, loaf, pond
- **Pulses** (oscillators): blinker, toad, beacon (p2), pulsar (p3), pentadecathlon (p15)
- **Voyagers** (spaceships): glider ×4 orientations, lightweight spaceship
- **Fountains:** Gosper glider gun
- **Wildcards** (chaotic evolvers): R-pentomino, acorn

Click to arm a pattern → ghost preview follows cursor (`R` rotates) → click to stamp. Works while running or paused. Single-cell paint mode for touch-ups.

### Controls

Play/pause, tick-rate slider (1–8 gen/s), key select, scale select, master volume, clear board. First-load "click to start audio" gate (Web Audio autoplay policy).

### Visual feedback

- Stable per-cluster hue derived from cluster ID.
- Cells flash brighter on birth, fade out on death.
- Faint concentric rings around grid center visualize the pitch contours.

## Error handling

- Voice exhaustion degrades gracefully (smallest clusters muted first).
- Limiter prevents clipping regardless of population.
- Empty board = silence + a hint to place a pattern.
- Audio context suspension (tab backgrounded, etc.) is surfaced with the same tap-to-resume gate.

## Testing

- **Unit tests (Vitest):** Life rules against known patterns (blinker period-2, glider displacement per 4 gens, still-life stability); cluster identity through merge/split/move; scale quantization (correct frequencies for known key/scale/distance triples); ping cap and stagger logic (pure parts).
- **Audio:** thin manual smoke-test checklist (pings audible on birth, pad per cluster, warble on blinker, glider pitch arc, limiter under population boom). No automated audio tests.

## Out of scope (v1)

Saving/loading compositions, MIDI out, recording/export, mobile-optimized layout, custom pattern import (RLE), multiple simultaneous boards.
