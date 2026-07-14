# Arpeggio Mode — Design Spec

**Date:** 2026-07-14
**Status:** Approved (user authorized spec → implementation without further review)
**Extends:** docs/superpowers/specs/2026-07-13-life-ambient-music-design.md

## Overview

A second voice type for the Life ambient composer. The user toggles **arpeggio
mode** (the `A` key or a button). Clusters **born while the mode is on** become
*arpeggios* instead of pads; everything already sounding is unaffected. An
arpeggio reads its cluster as a piano roll — rows are time (top→down across one
generation), the chosen cell's x-offset from the cluster's left edge is the
scale-degree offset above the cluster's root — and **re-derives every
generation**, so the evolving pattern IS the sequencer: still lifes loop a
fixed riff, oscillators cycle riff variations at their period, gliders
transpose their riff as they travel.

## Behavior

### Mode + registry

- `main.ts` owns a boolean `arpMode` (default off) and a registry
  `arpIds: Set<number>`.
- Toggle via keyboard `a`/`A` or the panel button; both update the panel's
  visual active state.
- On every tracker update (audible tick or paused refresh): ids in
  `events.born` are added to `arpIds` iff `arpMode` is on; ids in
  `events.died` are removed. Nothing else ever mutates the registry — so
  voice type follows the surviving id through merges and splits, matching the
  existing identity rules.
- Both the renderer and the SoundMapper consume the registry; neither knows
  about the mode itself.

### Pattern derivation (pure)

`deriveArpeggio(cells, maxNotes, rng) → ArpNote[]` in `src/audio/arpeggio.ts`:

- Group live cells by row (y); order rows top→down.
- If the cluster has more rows than `maxNotes`, sample rows evenly,
  endpoint-inclusive (same policy as ping overflow sampling).
- Per selected row, choose ONE cell uniformly at random via the injected
  `rng` (`Math.random` in production, seeded in tests). Randomness re-rolls
  every generation.
- `degreeOffset = cell.x − bboxMinX` — scale degrees above the root, never
  negative, **no octave wrap**: wide clusters climb multiple octaves.
- Empty cell list → empty result. `maxNotes ≤ 1` → single note from the top
  row.

### Pitch

- `scale.ts` splits `quantize` into `radialToDegree(radial, scale, octaves)`
  and `degreeToFreq(degreeIndex, key, scale, baseMidi)`; `quantize` becomes
  their composition (behavior unchanged — existing tests must stay green).
  `degreeToFreq` requires `degreeIndex ≥ 0`.
- Arp note frequency = `degreeToFreq(rootDegree + degreeOffset, key, scale,
  ARP_BASE_MIDI = 60, ARP_MAX_MIDI = 108)` where `rootDegree =
  radialToDegree(m.radial, scale, 2)`. Arps sit one octave above the pad
  register (pads 48, arps 60, pings 72), unwrapped, so wide clusters
  genuinely climb octaves — bounded at MIDI 108 (C8): pitches above the
  ceiling fold down by whole octaves.
- Key/scale changes apply on the next generation's derivation, like pads.

### Scheduling

Per audible tick, for each live, allocated arp cluster:

- `slot = tickSec / noteCount`. Notes fire top-down at
  `now + row·slot ± jitter`, where `jitter = uniform(±jitterPct% of slot)`
  (slider 0–5%, default 1%).
- Note duration = `slot × 0.9` gate (code constant). Taller cluster → more
  rows → shorter slots → shorter notes: the y-dimension duration rule falls
  out naturally.
- Voice = one mono synth per cluster (retrigger cuts the previous note),
  through a per-voice panner (pan from centroid x, like pads), into a shared
  arp gain (the volume slider, default −10 dB — quieter than pads), into the
  existing bus (lowpass → reverb → duck → limiter). Ducking and limiting
  apply unchanged; arp clusters count toward population ducking like any
  cluster.
- Instruments (select): `pluck` (Tone.PluckSynth, default), `bell`
  (FM, inharmonic, fast decay), `keys` (AM, soft envelope). Changing the
  instrument disposes all arp voices; they recreate lazily on the next tick.
- Allocation: arps have their own pool, `MAX_ARPS = 8`, largest clusters win
  (reuse `allocateVoices`). Pads keep their separate 16. An unallocated arp
  cluster simply schedules nothing that tick.
- Death/orphan: a died or orphaned arp id schedules nothing further; its
  voice is disposed after a ~4 s delay so in-flight notes ring out into the
  reverb. The orphan-reconciliation sweep covers arp voices exactly as it
  covers pads.
- Pings, the anchor drone, and pad behavior are unchanged. Births inside arp
  clusters still ping.

### SoundMapper interface changes

- `handleTick(events, births, population, tickSec, gridW, gridH,
  arpIds: ReadonlySet<number> = new Set())` — optional param keeps every
  intermediate commit compiling.
- New setters: `setArpVolume(db)`, `setArpMaxNotes(n)`,
  `setArpInstrument(instrument)`, `setArpJitter(pct)`.
- `ArpInstrument` type lives in `arpeggio.ts` (pure module) so the UI can
  import it without touching Tone.js.

### UI

- New right sidebar `#arp-panel` (mirrors the left palette visually):
  - **Arpeggio mode** toggle button, `active` class + accent styling when on.
  - Sliders: arp volume (−30..0 dB, default −10), max notes/generation
    (4–16, step 1, default 16), jitter (0–5%, step 0.5, default 1).
  - Instrument select: Pluck / Bell / Soft Keys.
- `buildArpPanel(root, callbacks) → { setMode(active) }` in `controls.ts`,
  same callback-only pattern as `buildControls`.
- Renderer: `setArpIds(ids)`; arp-cluster cells draw **hollow** (stroked in
  the cluster hue) instead of filled, so modes are visible at a glance.
- Layout: `#app` becomes palette | main | arp-panel.

## Testing

- **Unit (Vitest):** `deriveArpeggio` — top-down row order, left-edge degree
  offsets, seeded-rng column choice, endpoint-inclusive row sampling above
  the cap, single-row and empty clusters, `maxNotes ≤ 1` guard, determinism
  with a fixed rng. `scale.ts` — `degreeToFreq` octave math (degree 0 = base,
  degree len = +1 octave, multi-octave no-wrap), `radialToDegree` endpoints,
  and all existing `quantize` tests unchanged.
- **Manual smoke additions (docs/smoke-test.md items 14–16):** blinker placed
  in arp mode alternates its two riff readings at period 2; toggling the mode
  changes no already-sounding voice; each arp panel control audibly works
  (volume, max notes, instrument, jitter at 5%).

## Out of scope

Per-cluster mode editing after birth, arpeggio note-order modes (up/down/
ping-pong — random-per-row only), swing/groove templates, MIDI out,
persisting panel settings.
