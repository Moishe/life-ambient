# Mood Worlds — design spec (2026-07-14)

## What

Three related features sharing one data model:

1. **Mood templates** — named, curated recipes ("Reading", "Sprinting", …) that
   recreate a whole world in one click: pattern placements on the grid AND matching
   sound settings (speed, key, scale, arp mode/instrument). Randomized within the
   mood: every apply rolls a fresh arrangement. Everything remains fully editable
   afterward — placed patterns are ordinary cells, settings are ordinary controls.
2. **Save/load** — snapshot the current world (cells + settings) by name into
   localStorage; load or delete later.
3. **Share links** — encode the current world into a URL fragment; opening the link
   recreates it (after the audio gate).

## The world model

A world is exactly:

```
WorldState = {
  cells: Cell[],                    // live cells on the 96×96 grid
  settings: {
    rate,                           // generations/sec 1..8
    key, scale,                     // musical identity
    masterDb,                       // -30..0
    arpMode,                        // boolean
    arpDb, arpMaxNotes, arpInstrument, arpJitterPct,
  }
}
```

Deliberately NOT captured: cluster ids, arp membership (`arpIds`), play/pause,
recording state, armed tool. Cluster identity is runtime-only; see "Arp membership"
below for the approximation.

## Decisions (user-confirmed)

- Templates set **board + sound settings** (one click = coherent world).
- **Randomized within the mood** — each mood is a recipe (pattern groups with count
  ranges, rate range, scale choices), not a fixed layout. Key is random each roll.
- **Replace on apply** — the board is cleared first ("recreate a world").
- **Save/load AND shareable URLs** ship in this feature. One codec serves both:
  a saved world is the same serialized string a share link carries.

## Moods (6)

| id | name | recipe | rate | scales | arp |
|---|---|---|---|---|---|
| reading | Reading | 6–9 drones + 1–2 blinkers | 1–2 | major pent., lydian | off |
| writing | Writing | 4–7 small pulses + 1 pulsar + 0–1 pentadecathlon | 3–4 | dorian, aeolian | off |
| thinking | Thinking | 3–5 gliders + 1–2 LWSS + 2–3 drones | 4–5 | lydian, whole tone | off |
| break | Break | 3–5 drones + 2–4 small pulses + 0–1 pulsar | 2–3 | major pent. | **on**, bell |
| grinding | Grinding | 1 Gosper gun + 2–4 drones | 4 | dorian | off |
| sprinting | Sprinting | 1–2 R-pentominoes + 1 acorn + 2–3 gliders | 6–8 | minor pent., whole tone | off |

Moods override *musical identity* (rate, key, scale, arp mode + instrument) but
**preserve the user's current volumes** (master, arp) and arp max-notes/jitter —
volume is a room decision, not a mood decision.

Placement: random positions with a margin from the walls and a Chebyshev gap ≥ 6
between pattern bounding boxes, so freshly placed patterns start as distinct
clusters (tracker joins within Chebyshev ≤ 2) and oscillators have room to breathe.
Random rotation per instance. Best-effort: if a spot can't be found after N tries,
that instance is skipped (counts are ranges; silence about it is fine).

## Serialized format (v1)

URL-safe string, fields joined by `~`:

```
1~<gridW>~<gridH>~<rate>~<keyIdx>~<scaleIdx>~<masterDb>~<arp 0|1>~<arpDb>~<maxNotes>~<instIdx>~<jitterPct>~<board>
```

- key/scale/instrument as indices into orders **pinned in the codec** (append-only;
  never reorder — old links must keep decoding).
- board: `r` + linear RLE over the row-major grid (`<count>b` dead / `<count>o`
  alive, trailing dead run omitted), OR `x` + base64url raw bitmap — serializer
  picks whichever is shorter, so dense boards can't blow past URL length limits
  (raw is a fixed ~1.5 KB for 96×96; typical sparse boards RLE to a few hundred
  chars).
- `deserializeWorld` is defensive: any malformed field, out-of-range value, or
  bit-count mismatch → `null` (share links are untrusted input). Cells outside the
  live grid are dropped at placement time (`engine.set` already ignores OOB).

Share link: `location.origin + location.pathname + '#w=' + serialized`.
localStorage: one JSON map `name → serialized` under `life-ambient.worlds.v1`.

## Applying a world (order matters)

1. Settings first: rate (reschedule loop), key/scale, volumes, arp params, and
   **arp mode before any board change** — the arp registry only admits clusters
   born while the mode is on, so the mode must be correct when the new clusters
   are born.
2. Board: `engine.clear()`, set all cells, then `refresh(!playing)` — same
   semantics as click-editing: audible immediately while playing; while paused it
   arranges silently and the orphan reconcile settles voices on resume.

Old clusters die in the same tracker update that births the new ones, so pads
release and `arpIds` self-cleans via the existing invariant (died → remove).

**Arp membership approximation**: a loaded/shared world with `arpMode: true` makes
*all* its clusters arps (they're all "born" at apply time with the mode on). Exact
per-cluster arp membership is not preserved — acceptable, documented here.

## UI

- **Moods**: a "Moods" section at the top of the left palette — one button per
  mood, tagline as tooltip. The applied mood stays highlighted in its own accent
  (distinct from the tool-palette selection) until another mood is applied, a
  world is loaded, or Clear is pressed.
- **Mood transition**: a mood switch clears the board immediately (every voice
  fades over its 4 s release), then after ~3 s of fading quiet the new world
  lands and starts sounding; the button "breathes" during the gap. Editing the
  board, Clear, or loading a world during the gap cancels the incoming mood.
  World loads and `#w=` links stay instant (no gap).
- **World panel**: below the arp panel (right sidebar): Save (prompts for a name),
  a select + Load + Delete for saved worlds, and Share (copies link, flashes
  "Copied!"). DOM-only with callbacks, per controls.ts convention.
- Controls gain setters (`setRate/setKey/setScale/setVolume`, arp
  `setSettings`) so applying a world updates what the sliders show. Setters write
  element values only — they never fire callbacks (no feedback loops).
- URL worlds apply right after the start-button init (the audio gate already
  guarantees a user gesture).

## Out of scope

- Live `hashchange` handling (links load on boot only).
- Preserving exact arp membership per cluster.
- Import/export files; cloud anything.
- Mood morphing/crossfade (the transition is a silence gap, not a blend).

## Testing

Pure modules (`world/codec.ts`, `world/moods.ts`) get full Vitest coverage:
round-trips, malformed-input rejection, seeded-rng generator properties (bounds,
bbox separation, count ranges, determinism). UI/wiring covered by new
`docs/smoke-test.md` entries, per project testing philosophy.
