# Life Ambient — CLAUDE.md

Conway's Game of Life as an ambient music composer, in the browser. The user
places curated Life patterns on a 96×96 grid; evolving cell clusters become
synth voices. Built from scratch 2026-07-13/14.

- **Live:** http://www.moishelettvin.com/life-ambient/ (GitHub Pages, custom domain)
- **Repo:** https://github.com/Moishe/life-ambient (remote `origin`, HTTPS)
- **Deploy:** every push to `main` runs `.github/workflows/deploy.yml` (npm ci → tests → build → Pages). No manual deploy step.

## Commands

```
npm run dev        # Vite dev server (base '/', app at root)
npm test           # Vitest, all unit tests (pure modules only)
npm run typecheck  # tsc --noEmit (strict; must stay clean)
npm run build      # typecheck + vite build (base '/life-ambient/' for Pages)
```

## Architecture

Strict one-way flow, wired only in `src/main.ts`:

```
LifeEngine → ClusterTracker → SoundMapper (Tone.js)
                 ↘ Renderer (canvas)   ↖ controls (DOM callbacks)
```

| File | Responsibility |
|---|---|
| `src/engine/life.ts` | Pure sim. Bounded 96×96 (NO wraparound), B3/S23. `tick()` returns births/deaths diff. |
| `src/engine/patterns.ts` | 14 curated patterns as `#`/`.` row-strings (precision data!), `rotateCells` (90° CW, non-negative coords), `placePattern`. |
| `src/tracker/cluster.ts` | Union-find grouping (cells cluster within **Chebyshev ≤ 2**, one-cell gaps join) + `ClusterTracker`: stable ids across ticks + per-cluster metrics. |
| `src/geometry.ts` | `cellRadial` (0 center → 1 corner), `panFromX` (−1..1). |
| `src/audio/scale.ts` | Pure pitch math: `radialToDegree`, `degreeToFreq` (unwrapped degrees; optional `maxMidi` octave-fold), `quantize` = composition of the two. 6 scales, 12 keys. |
| `src/audio/allocation.ts` | Pure policy: `planPings` (cap 12/tick, 80 ms stagger, endpoint-inclusive overflow sampling), `allocateVoices` (largest win), `orphanedVoiceIds`. |
| `src/audio/arpeggio.ts` | Pure: `deriveArpeggio(cells, maxNotes, rng)` — piano-roll read of a cluster (rows top-down, one random cell/row, x−minX = degree offset). `ArpInstrument` type lives here so UI never imports Tone. |
| `src/audio/soundMapper.ts` | ALL Tone.js. PadVoice + ArpVoice pools, ping synth, anchor drone, bus. Only this file and `main.ts` may import `tone`. |
| `src/ui/renderer.ts` | Canvas: cluster hues (golden angle), birth flash 600 ms, death fade 900 ms, pitch rings, hollow cells for arps, preview ghost, empty hint. |
| `src/ui/controls.ts` | DOM only, everything flows out via callbacks: `buildControls` (palette + transport/key) and `buildArpPanel`. |
| `src/main.ts` | Wiring only: transport tick pipeline, pointer/keyboard, audio gate, `?debug` overlay. |

### Sound model (the core design)

- **Cluster identity is musical identity.** Tracker rules: match by cell overlap (ties → lower prev id, explicitly — never rely on Map order), centroid fallback ≤ 3 for movers, merge → larger keeps id, split → largest fragment keeps id. A blinker keeps one pad forever.
- **Pads** (default voice): pitch = centroid's radial distance from grid center, quantized to key+scale over 2 octaves, base MIDI 48. Pan from x. Warble from cell-count delta, brightness from bbox aspect, vibrato from centroid velocity. Pool of 16; smallest muted first; muted pads resume.
- **Pings**: births only, base MIDI 72, staggered/capped so booms strum. **Deaths are always silent** — pads just fade (release 4 s).
- **Arpeggio mode** (`A` key / panel toggle): clusters **born while on** (tracked in main's `arpIds` set — ids enter only at birth-while-on, leave only at death; this registry rule is the invariant) get a mono ArpVoice instead of a pad. Piano roll re-derives EVERY generation ("the pattern is the sequencer"). Base MIDI 60, no wrap but folds above C8 (108) by octaves to prevent aliasing. Pool of 8. Slot = tickSec/noteCount, gate 0.9, jitter ±% of slot.
- **Mix safety**: everything → lowpass 4500 → reverb 8 s → population duck gain → limiter −3 dB. Population is unbounded; output level is not.
- **Orphan reconcile**: every `handleTick` releases any voice whose id isn't in the current live set, per family. This exists because paused edits run the tracker silently and discard `died` events — without it, pads stick forever (real bug we shipped and fixed).

## Testing philosophy

Pure modules get Vitest unit tests (72 passing; engine correctness is pinned by real patterns: blinker period, glider displacement, Gosper gun = 41 cells at gen 30). Tone.js and canvas/DOM layers are deliberately NOT unit-tested — they're covered by `docs/smoke-test.md` (16 manual listening checks). Don't add tests that mock Tone.

## Development process (user preferences)

- **Don't implement with Fable** — it plans, orchestrates, reviews. Dispatch implementation to Opus (logic/integration-risk tasks) and Sonnet (well-specified tasks) subagents. Correctness and maintainability outrank cost. (Also in memory: `prefer-cheap-models-for-implementation`.)
- Flow used both times and worth repeating: brainstorm → spec in `docs/superpowers/specs/` → plan with complete code in `docs/superpowers/plans/` → subagent-driven development (fresh implementer + reviewer per task, feature branch) → final whole-branch review → merge to main → push (auto-deploys).
- The per-task + final reviews have caught real bugs every time (Map-order tie-break, overflow sampling dropping the last birth, stuck orphan pads, ultrasonic aliasing). Keep the review gates.

## Environment gotchas

- **Devcontainer has no host credentials.** `gh auth login` must run INSIDE the session (user types `! gh auth login`, device flow), then `gh auth setup-git`; remote is HTTPS (host SSH keys are unreachable). 
- **npm optional-deps bug**: if build fails with `Cannot find module @rollup/rollup-linux-arm64-gnu`, run `rm -rf node_modules && npm install`.
- **Vite base path**: builds use `/life-ambient/`; dev uses `/`. Don't break this — Pages serves from a subdirectory.
- Arp panel slider defaults must match SoundMapper field defaults (16/pluck/1%); only the volume callback fires at build time. Comment in `controls.ts` marks the coupling.

## Open threads

- **iPad plays no audio** (all iPad browsers are WebKit). Prime suspect: iOS Silent Mode mutes Web Audio while videos still play. Diagnostics: load the site with `?debug` for an on-screen overlay (audio state / tone now / transport / population / errors). Awaiting user's readings. Real console needs a Mac + Safari Web Inspector.
- User's listening pass of `docs/smoke-test.md` (16 items) may still be pending.
- Cosmetic deferred minors are listed in the final-review sections of `.superpowers/sdd/progress.md` (git-ignored scratch — may not exist in fresh clones).
