# Arpeggio Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable arpeggio mode: clusters born while it's on become living piano-roll arpeggios (re-derived from the cluster's shape every generation) instead of pads.

**Architecture:** A new pure module `src/audio/arpeggio.ts` derives the note pattern from cluster cells (testable, seedable rng). `scale.ts` splits `quantize` into `radialToDegree` + `degreeToFreq` so arps can address unwrapped scale degrees. `SoundMapper` grows an `ArpVoice` (mono synth + panner, per-generation scheduling) beside `PadVoice`, keyed off an `arpIds` registry that `main.ts` owns (ids added at birth while the mode is on, removed at death). Renderer draws arp clusters hollow; a new right sidebar holds the arp controls.

**Tech Stack:** Existing project — TypeScript strict, Vite, Vitest, Tone.js.

**Spec:** `docs/superpowers/specs/2026-07-14-arpeggio-mode-design.md` — read it before starting any task.

**Model guidance (per user preference):** Do not execute tasks with Fable. **Opus** for Tasks 3 and 6 (Tone.js integration, main wiring); **Sonnet** for Tasks 1, 2, 4, 5. Escalate any task to Opus if its first attempt fails review.

## Global Constraints

- Arp register base MIDI 60 (`ARP_BASE_MIDI`); pads stay 48, pings stay 72.
- `MAX_ARPS = 8`, separate from the pad pool of 16; largest clusters win (reuse `allocateVoices`).
- Note gate = slot × 0.9 (`ARP_GATE = 0.9`, code constant).
- Degree offsets are `cell.x − bboxMinX`, ≥ 0, **no octave wrap**.
- Rows sample evenly, **endpoint-inclusive**, when a cluster is taller than maxNotes (same policy as ping overflow).
- Arp panel defaults: volume −10 dB, max notes 16 (range 4–16), instrument pluck, jitter 1% (range 0–5%, % of note slot).
- Registry rule: ids enter `arpIds` ONLY when born while the mode is on; leave ONLY on death. Voice type follows the surviving id through merges/splits.
- `handleTick`'s new `arpIds` parameter is optional (`= new Set()`) so every intermediate commit compiles.
- Deaths stay silent; pings, anchor, ducking, limiter unchanged.
- TypeScript `strict: true`; `npm run typecheck` must pass at every commit. All test commands use Vitest.

---

### Task 1: scale.ts — split quantize into radialToDegree + degreeToFreq

**Files:**
- Modify: `src/audio/scale.ts` (the `quantize` function)
- Test: `tests/scale.test.ts` (append)

**Interfaces:**
- Consumes: existing `SCALES`, `KEYS`, `midiToFreq` in the same file.
- Produces (new exports, consumed by Task 3):
  - `function radialToDegree(radial: number, scale: ScaleName, octaves?: number): number` — clamps radial to [0,1], maps onto `octaves * scaleLength + 1` degrees (default octaves 2), returns the degree index.
  - `function degreeToFreq(degreeIndex: number, key: KeyName, scale: ScaleName, baseMidi?: number): number` — degree index (≥ 0, unwrapped: index ≥ scaleLength climbs octaves) to frequency; default baseMidi 48.
  - `quantize` keeps its exact signature and behavior (all existing tests must stay green untouched).

- [ ] **Step 1: Write the failing tests**

Append to `tests/scale.test.ts` (extend the import line with `radialToDegree, degreeToFreq`):

```ts
describe('radialToDegree', () => {
  it('maps endpoints to first and last degree', () => {
    expect(radialToDegree(0, 'majorPentatonic')).toBe(0);
    expect(radialToDegree(1, 'majorPentatonic')).toBe(10); // 2 octaves x 5 steps
    expect(radialToDegree(1, 'dorian')).toBe(14); // 2 octaves x 7 steps
  });

  it('clamps out-of-range radial', () => {
    expect(radialToDegree(-1, 'majorPentatonic')).toBe(0);
    expect(radialToDegree(2, 'majorPentatonic')).toBe(10);
  });
});

describe('degreeToFreq', () => {
  it('degree 0 is the base root', () => {
    expect(degreeToFreq(0, 'C', 'majorPentatonic')).toBeCloseTo(130.81, 1); // C3
  });

  it('degree = scale length is exactly one octave up', () => {
    expect(degreeToFreq(5, 'C', 'majorPentatonic')).toBeCloseTo(261.63, 1); // C4
    expect(degreeToFreq(7, 'C', 'dorian')).toBeCloseTo(261.63, 1);
  });

  it('keeps climbing across octaves without wrapping', () => {
    expect(degreeToFreq(10, 'C', 'majorPentatonic')).toBeCloseTo(523.25, 1); // C5
    expect(degreeToFreq(12, 'C', 'majorPentatonic')).toBeCloseTo(659.25, 1); // E5 (midi 76)
  });

  it('applies the key offset', () => {
    expect(degreeToFreq(0, 'D', 'majorPentatonic')).toBeCloseTo(146.83, 1); // D3
  });

  it('composes into quantize', () => {
    expect(quantize(0.5, 'C', 'majorPentatonic')).toBeCloseTo(
      degreeToFreq(radialToDegree(0.5, 'majorPentatonic'), 'C', 'majorPentatonic'),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scale.test.ts`
Expected: FAIL — `radialToDegree` is not exported.

- [ ] **Step 3: Implement**

In `src/audio/scale.ts`, replace the existing `quantize` function with:

```ts
export function radialToDegree(radial: number, scale: ScaleName, octaves = 2): number {
  const steps = SCALES[scale];
  const degreeCount = steps.length * octaves + 1;
  const clamped = Math.max(0, Math.min(1, radial));
  return Math.round(clamped * (degreeCount - 1));
}

// degreeIndex must be >= 0; indices past one scale length keep climbing (no wrap).
export function degreeToFreq(
  degreeIndex: number,
  key: KeyName,
  scale: ScaleName,
  baseMidi = 48,
): number {
  const steps = SCALES[scale];
  const octave = Math.floor(degreeIndex / steps.length);
  const midi = baseMidi + KEYS.indexOf(key) + octave * 12 + steps[degreeIndex % steps.length];
  return midiToFreq(midi);
}

export function quantize(
  radial: number,
  key: KeyName,
  scale: ScaleName,
  baseMidi = 48,
  octaves = 2,
): number {
  return degreeToFreq(radialToDegree(radial, scale, octaves), key, scale, baseMidi);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scale.test.ts`
Expected: PASS — all previous quantize tests AND the new suites (15 tests total in this file).

Run: `npx vitest run && npm run typecheck`
Expected: whole suite green, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/audio/scale.ts tests/scale.test.ts
git commit -m "refactor: split quantize into radialToDegree + degreeToFreq"
```

---

### Task 2: Arpeggio derivation (pure)

**Files:**
- Create: `src/audio/arpeggio.ts`
- Test: `tests/arpeggio.test.ts`

**Interfaces:**
- Consumes: `Cell` from `src/engine/life.ts` (type only).
- Produces (consumed by Tasks 3 and 5):
  - `type ArpInstrument = 'pluck' | 'bell' | 'keys'`
  - `interface ArpNote { degreeOffset: number; row: number }`
  - `function deriveArpeggio(cells: Cell[], maxNotes?: number, rng?: () => number): ArpNote[]` — defaults maxNotes 16, rng Math.random.

- [ ] **Step 1: Write the failing tests**

`tests/arpeggio.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveArpeggio } from '../src/audio/arpeggio';

const cells = (list: [number, number][]) => list.map(([x, y]) => ({ x, y }));
const firstCell = () => 0; // rng: always the first cell in a row
const lastCell = () => 0.999; // rng: always the last cell in a row

describe('deriveArpeggio', () => {
  it('returns nothing for an empty cluster', () => {
    expect(deriveArpeggio([], 16, firstCell)).toEqual([]);
  });

  it('reads rows top-down, one note per row', () => {
    const notes = deriveArpeggio(cells([[5, 7], [5, 5], [5, 6]]), 16, firstCell);
    expect(notes).toEqual([
      { degreeOffset: 0, row: 0 },
      { degreeOffset: 0, row: 1 },
      { degreeOffset: 0, row: 2 },
    ]);
  });

  it('measures degree offsets from the cluster left edge', () => {
    const notes = deriveArpeggio(cells([[10, 0], [13, 1]]), 16, firstCell);
    expect(notes).toEqual([
      { degreeOffset: 0, row: 0 },
      { degreeOffset: 3, row: 1 },
    ]);
  });

  it('chooses the cell within a row via the injected rng', () => {
    const row = cells([[2, 0], [4, 0], [6, 0]]);
    expect(deriveArpeggio(row, 16, firstCell)[0].degreeOffset).toBe(0);
    expect(deriveArpeggio(row, 16, lastCell)[0].degreeOffset).toBe(4);
  });

  it('is deterministic for a fixed rng', () => {
    const blob = cells([[0, 0], [1, 0], [0, 1], [2, 1], [1, 2]]);
    expect(deriveArpeggio(blob, 16, lastCell)).toEqual(deriveArpeggio(blob, 16, lastCell));
  });

  it('samples rows evenly with endpoints when taller than maxNotes', () => {
    // 21-row column; each row y has a single cell at x = y % 3
    const column = cells(Array.from({ length: 21 }, (_, y) => [y % 3, y] as [number, number]));
    const notes = deriveArpeggio(column, 16, firstCell);
    expect(notes).toHaveLength(16);
    expect(notes[0].row).toBe(0);
    expect(notes[0].degreeOffset).toBe(0); // y=0 -> x=0
    expect(notes[15].row).toBe(15);
    expect(notes[15].degreeOffset).toBe(2); // y=20 -> x=2: bottom row included
  });

  it('handles maxNotes <= 1 with the top row only', () => {
    expect(deriveArpeggio(cells([[0, 0], [0, 5]]), 1, firstCell)).toEqual([
      { degreeOffset: 0, row: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/arpeggio.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/audio/arpeggio.ts`:

```ts
import type { Cell } from '../engine/life';

export type ArpInstrument = 'pluck' | 'bell' | 'keys';

export interface ArpNote {
  /** Scale degrees above the cluster root (>= 0, no octave wrap). */
  degreeOffset: number;
  /** 0-based position in the selected row sequence, top-down. */
  row: number;
}

export function deriveArpeggio(
  cells: Cell[],
  maxNotes = 16,
  rng: () => number = Math.random,
): ArpNote[] {
  if (cells.length === 0) return [];
  let minX = Infinity;
  const rows = new Map<number, number[]>();
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    let xs = rows.get(c.y);
    if (!xs) {
      xs = [];
      rows.set(c.y, xs);
    }
    xs.push(c.x);
  }
  const ys = [...rows.keys()].sort((a, b) => a - b);
  let selected: number[];
  if (ys.length <= maxNotes) {
    selected = ys;
  } else if (maxNotes <= 1) {
    selected = [ys[0]];
  } else {
    const step = (ys.length - 1) / (maxNotes - 1);
    selected = Array.from({ length: maxNotes }, (_, i) => ys[Math.round(i * step)]);
  }
  return selected.map((y, i) => {
    const xs = rows.get(y)!;
    const pick = Math.min(xs.length - 1, Math.floor(rng() * xs.length));
    return { degreeOffset: xs[pick] - minX, row: i };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/arpeggio.test.ts`
Expected: PASS (7 tests).

Run: `npx vitest run && npm run typecheck`
Expected: whole suite green, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/audio/arpeggio.ts tests/arpeggio.test.ts
git commit -m "feat: piano-roll arpeggio derivation from cluster cells"
```

---

### Task 3: SoundMapper — ArpVoice and arp scheduling

**Files:**
- Modify: `src/audio/soundMapper.ts`

**Interfaces:**
- Consumes: `deriveArpeggio`, `ArpInstrument`, `ArpNote` from `src/audio/arpeggio.ts`; `radialToDegree`, `degreeToFreq` from `src/audio/scale.ts` (Task 1); existing `allocateVoices`, `orphanedVoiceIds` from `./allocation`; existing `ClusterMetrics` fields `id/cells/cellCount/radial/pan`.
- Produces (consumed by Task 6):
  - `handleTick(events, births, population, tickSec, gridW, gridH, arpIds?: ReadonlySet<number>)` — new optional last parameter, default `new Set()`.
  - `setArpVolume(db: number)`, `setArpMaxNotes(n: number)`, `setArpJitter(pct: number)`, `setArpInstrument(instrument: ArpInstrument)`.
- No unit tests: Tone.js side effects (spec waives audio tests). Verification = typecheck + build + suite still green.

- [ ] **Step 1: Implement**

All edits in `src/audio/soundMapper.ts`.

1a. Extend imports — add to the existing `./scale` import: `radialToDegree, degreeToFreq`; add a new import line:

```ts
import { deriveArpeggio, type ArpInstrument, type ArpNote } from './arpeggio';
```

1b. Add constants next to the existing `PAD_BASE_MIDI`/`PING_BASE_MIDI`/`MAX_PADS`:

```ts
const ARP_BASE_MIDI = 60; // one octave above pads, one below pings
const MAX_ARPS = 8;
const ARP_GATE = 0.9;
```

1c. Add `ArpVoice` class after the existing `PadVoice` class:

```ts
class ArpVoice {
  private synth: Tone.PluckSynth | Tone.FMSynth | Tone.AMSynth;
  private panner = new Tone.Panner(0);

  constructor(out: Tone.ToneAudioNode, instrument: ArpInstrument) {
    switch (instrument) {
      case 'bell':
        this.synth = new Tone.FMSynth({
          harmonicity: 3.01,
          modulationIndex: 14,
          envelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.4 },
          modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 },
          volume: -10,
        });
        break;
      case 'keys':
        this.synth = new Tone.AMSynth({
          harmonicity: 2,
          envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.6 },
          volume: -8,
        });
        break;
      default:
        this.synth = new Tone.PluckSynth({ dampening: 3500, resonance: 0.9, volume: -6 });
    }
    this.synth.connect(this.panner);
    this.panner.connect(out);
  }

  schedule(
    notes: ArpNote[],
    rootDegree: number,
    key: KeyName,
    scale: ScaleName,
    tickSec: number,
    when: number,
    jitterPct: number,
    pan: number,
  ): void {
    if (notes.length === 0) return;
    this.panner.pan.rampTo(Math.max(-1, Math.min(1, pan)), 0.5);
    const slot = tickSec / notes.length;
    for (const n of notes) {
      const freq = degreeToFreq(rootDegree + n.degreeOffset, key, scale, ARP_BASE_MIDI);
      const jitter = (Math.random() * 2 - 1) * (jitterPct / 100) * slot;
      const t = Math.max(when, when + n.row * slot + jitter);
      this.synth.triggerAttackRelease(freq, slot * ARP_GATE, t, 0.5);
    }
  }

  dispose(): void {
    this.synth.dispose();
    this.panner.dispose();
  }
}
```

(Jitter can never reorder adjacent notes: max ±5% of a slot, notes are one full slot apart.)

1d. Add fields to `SoundMapper` next to the existing `pads` map:

```ts
private arps = new Map<number, ArpVoice>();
private arpGain!: Tone.Gain;
private arpDb = -10;
private arpInstrument: ArpInstrument = 'pluck';
private arpMaxNotes = 16;
private arpJitterPct = 1;
```

1e. In `init()`, after the anchor oscillators are created (before `this.ready = true`):

```ts
this.arpGain = new Tone.Gain(Math.pow(10, this.arpDb / 20)).connect(this.busIn);
```

1f. Add setters next to `setMasterVolume` (same store-then-apply-if-ready pattern):

```ts
setArpVolume(db: number): void {
  this.arpDb = db;
  if (this.ready) this.arpGain.gain.rampTo(Math.pow(10, db / 20), 0.1);
}

setArpMaxNotes(n: number): void {
  this.arpMaxNotes = n;
}

setArpJitter(pct: number): void {
  this.arpJitterPct = pct;
}

setArpInstrument(instrument: ArpInstrument): void {
  this.arpInstrument = instrument;
  for (const voice of this.arps.values()) voice.dispose();
  this.arps.clear(); // voices recreate lazily with the new instrument next tick
}
```

1g. Change `handleTick`'s signature — append the optional parameter:

```ts
handleTick(
  events: ClusterEvents,
  births: Cell[],
  population: number,
  tickSec: number,
  gridW: number,
  gridH: number,
  arpIds: ReadonlySet<number> = new Set(),
): void {
```

1h. Rework the pad/arp section of `handleTick`. The died-release loop gains arp handling:

```ts
for (const id of events.died) {
  this.pads.get(id)?.release();
  this.pads.delete(id);
  const arp = this.arps.get(id);
  if (arp) {
    this.arps.delete(id);
    setTimeout(() => arp.dispose(), 4000); // let in-flight notes ring out
  }
}
```

Then split `active` and run pads over the pad half only (the pad loop body is UNCHANGED — only the collection it iterates over and the allocation input change from `active` to `padActive`):

```ts
const active = [...events.born, ...events.updated];
const padActive = active.filter(m => !arpIds.has(m.id));
const arpActive = active.filter(m => arpIds.has(m.id));
const audible = allocateVoices(
  padActive.map(m => ({ id: m.id, cellCount: m.cellCount })),
  MAX_PADS,
);
for (const m of padActive) {
  // ...existing pad body, unchanged...
}
```

After the pad loop, add the arp loop:

```ts
const arpAudible = allocateVoices(
  arpActive.map(m => ({ id: m.id, cellCount: m.cellCount })),
  MAX_ARPS,
);
for (const m of arpActive) {
  if (!arpAudible.has(m.id)) continue; // over the cap: silent this tick
  let voice = this.arps.get(m.id);
  if (!voice) {
    voice = new ArpVoice(this.arpGain, this.arpInstrument);
    this.arps.set(m.id, voice);
  }
  voice.schedule(
    deriveArpeggio(m.cells, this.arpMaxNotes),
    radialToDegree(m.radial, this.scale, 2),
    this.key,
    this.scale,
    tickSec,
    now,
    this.arpJitterPct,
    m.pan,
  );
}
```

(`now` is the existing `const now = Tone.now()` already declared at the top of `handleTick` for pings.)

1i. Update the orphan reconciliation to cover both voice families (replace the existing single reconcile block):

```ts
const livePadIds = new Set(padActive.map(m => m.id));
for (const id of orphanedVoiceIds(this.pads.keys(), livePadIds)) {
  this.pads.get(id)?.release();
  this.pads.delete(id);
}
const liveArpIds = new Set(arpActive.map(m => m.id));
for (const id of orphanedVoiceIds(this.arps.keys(), liveArpIds)) {
  const voice = this.arps.get(id)!;
  this.arps.delete(id);
  setTimeout(() => voice.dispose(), 4000);
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck` — clean. `npm run build` — succeeds. `npx vitest run` — all existing suites green.
If Tone v15 typings reject an option name, fix the annotation without changing graph structure or values, and record it in your report.

- [ ] **Step 3: Commit**

```bash
git add src/audio/soundMapper.ts
git commit -m "feat: ArpVoice with per-generation piano-roll scheduling in SoundMapper"
```

---

### Task 4: Renderer — hollow cells for arp clusters

**Files:**
- Modify: `src/ui/renderer.ts`

**Interfaces:**
- Produces (consumed by Task 6): `setArpIds(ids: ReadonlySet<number>): void` on `Renderer`.
- No unit tests (canvas side effects; `clusterHue` untouched).

- [ ] **Step 1: Implement**

In `src/ui/renderer.ts`:

1a. Add a field beside `clusters`/`flashes`/`fades` and a setter beside `setClusters`:

```ts
private arpIds: ReadonlySet<number> = new Set();
```

```ts
setArpIds(ids: ReadonlySet<number>): void {
  this.arpIds = ids;
}
```

1b. Replace the cluster-drawing loop in `draw()` (currently: set fillStyle from `clusterHue`, fill each cell) with:

```ts
for (const cl of this.clusters) {
  const hue = clusterHue(cl.id);
  if (this.arpIds.has(cl.id)) {
    ctx.strokeStyle = `hsl(${hue} 70% 65%)`;
    ctx.lineWidth = 1.5;
    for (const c of cl.cells) this.cellStroke(c.x, c.y);
  } else {
    ctx.fillStyle = `hsl(${hue} 60% 62%)`;
    for (const c of cl.cells) this.cellRect(c.x, c.y);
  }
}
```

1c. Add the stroke helper next to `cellRect`, with the same bounds guard:

```ts
private cellStroke(x: number, y: number): void {
  if (x < 0 || y < 0 || x >= this.gridW || y >= this.gridH) return;
  const p = this.cellPx;
  this.ctx.strokeRect(x * p + 1.25, y * p + 1.25, p - 2.5, p - 2.5);
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: all clean/green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/renderer.ts
git commit -m "feat: render arpeggio clusters as hollow cells"
```

---

### Task 5: Arp control panel (DOM + layout)

**Files:**
- Modify: `src/ui/controls.ts` (append), `index.html`, `src/style.css` (append)

**Interfaces:**
- Consumes: `ArpInstrument` from `src/audio/arpeggio.ts` (type-only import — controls must not import Tone-touching modules).
- Produces (consumed by Task 6):

```ts
interface ArpPanelCallbacks {
  onModeToggle(): void;
  onArpVolume(db: number): void;
  onArpMaxNotes(n: number): void;
  onArpInstrument(instrument: ArpInstrument): void;
  onArpJitter(pct: number): void;
}
function buildArpPanel(root: HTMLElement, cb: ArpPanelCallbacks): { setMode(active: boolean): void }
```

- `buildArpPanel` fires `cb.onArpVolume` once at build time so UI and audio state agree from the start (the master-volume desync lesson). Other defaults already match SoundMapper's field defaults.
- No unit tests (thin DOM; smoke-tested in Task 6).

- [ ] **Step 1: Implement**

1a. Append to `src/ui/controls.ts` (and add the type import at the top of the file):

```ts
import type { ArpInstrument } from '../audio/arpeggio';
```

```ts
export interface ArpPanelCallbacks {
  onModeToggle(): void;
  onArpVolume(db: number): void;
  onArpMaxNotes(n: number): void;
  onArpInstrument(instrument: ArpInstrument): void;
  onArpJitter(pct: number): void;
}

const ARP_INSTRUMENT_LABELS: Record<ArpInstrument, string> = {
  pluck: 'Pluck',
  bell: 'Bell',
  keys: 'Soft Keys',
};

export function buildArpPanel(
  root: HTMLElement,
  cb: ArpPanelCallbacks,
): { setMode(active: boolean): void } {
  const heading = document.createElement('h3');
  heading.textContent = 'Arpeggios';
  root.appendChild(heading);

  const toggle = document.createElement('button');
  toggle.textContent = 'Arpeggio mode';
  toggle.addEventListener('click', () => cb.onModeToggle());
  root.appendChild(toggle);

  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '-30';
  volume.max = '0';
  volume.step = '1';
  volume.value = '-10';
  volume.addEventListener('input', () => cb.onArpVolume(Number(volume.value)));
  root.appendChild(stacked('volume', volume));
  cb.onArpVolume(Number(volume.value));

  const maxNotes = document.createElement('input');
  maxNotes.type = 'range';
  maxNotes.min = '4';
  maxNotes.max = '16';
  maxNotes.step = '1';
  maxNotes.value = '16';
  maxNotes.addEventListener('input', () => cb.onArpMaxNotes(Number(maxNotes.value)));
  root.appendChild(stacked('max notes/gen', maxNotes));

  const instrument = document.createElement('select');
  for (const id of Object.keys(ARP_INSTRUMENT_LABELS) as ArpInstrument[]) {
    instrument.appendChild(new Option(ARP_INSTRUMENT_LABELS[id], id));
  }
  instrument.addEventListener('change', () =>
    cb.onArpInstrument(instrument.value as ArpInstrument),
  );
  root.appendChild(stacked('instrument', instrument));

  const jitter = document.createElement('input');
  jitter.type = 'range';
  jitter.min = '0';
  jitter.max = '5';
  jitter.step = '0.5';
  jitter.value = '1';
  jitter.addEventListener('input', () => cb.onArpJitter(Number(jitter.value)));
  root.appendChild(stacked('jitter %', jitter));

  return {
    setMode(active: boolean) {
      toggle.classList.toggle('active', active);
      toggle.textContent = active ? 'Arpeggio mode: ON' : 'Arpeggio mode';
    },
  };
}

function stacked(text: string, el: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'stack';
  const span = document.createElement('span');
  span.textContent = text;
  label.append(span, el);
  return label;
}
```

1b. In `index.html`, add the sidebar after `</main>` inside `#app`:

```html
    <aside id="arp-panel"></aside>
```

1c. Append to `src/style.css`:

```css
#arp-panel { width: 180px; display: flex; flex-direction: column; gap: 10px; }
#arp-panel h3 { margin: 10px 0 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; }
#arp-panel button { text-align: left; padding: 6px 8px; background: #151a24; color: inherit; border: 1px solid #232936; border-radius: 6px; cursor: pointer; }
#arp-panel button.active { border-color: #e0af68; color: #e0af68; }
#arp-panel label.stack { display: flex; flex-direction: column; gap: 4px; color: #9aa1ad; font-size: 12px; }
#arp-panel select { background: #151a24; color: inherit; border: 1px solid #232936; border-radius: 6px; padding: 4px 8px; }
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: all clean/green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/controls.ts index.html src/style.css
git commit -m "feat: arpeggio control panel (mode toggle, volume, notes, instrument, jitter)"
```

---

### Task 6: Main wiring, smoke tests, README

**Files:**
- Modify: `src/main.ts`, `docs/smoke-test.md` (append), `README.md`

**Interfaces:**
- Consumes: everything from Tasks 3–5.
- Produces: the working feature. Behavior contract:
  - `main.ts` owns `arpMode` (default false) and `const arpIds = new Set<number>()`.
  - Registry updates on EVERY tracker update (both `tick()` and `refresh()`): born ids added iff `arpMode`; died ids removed. Nothing else mutates it.
  - `A`/`a` key and the panel button both toggle the mode and update the panel's active state.
  - `arpIds` is passed to `mapper.handleTick(...)` (both call sites) and handed to the renderer once via `setArpIds` (live reference).

- [ ] **Step 1: Implement**

All edits in `src/main.ts` unless noted.

1a. Imports: extend the controls import and add the tracker type:

```ts
import { buildControls, buildArpPanel, type Tool } from './ui/controls';
import { ClusterTracker, type ClusterEvents } from './tracker/cluster';
```

1b. DOM query + guard: add `#arp-panel` beside the existing queries and include it in the null-check throw:

```ts
const arpPanelRoot = document.querySelector<HTMLElement>('#arp-panel');
```

```ts
if (!canvas || !controlsRoot || !paletteRoot || !arpPanelRoot || !gate || !startBtn) {
  throw new Error('missing root elements');
}
```

1c. State, next to the existing `let tool` / `let rotation`:

```ts
let arpMode = false;
const arpIds = new Set<number>();
```

1d. After the `renderer` is constructed:

```ts
renderer.setArpIds(arpIds);
```

1e. Registry helper (near `tick`/`refresh`):

```ts
function updateArpRegistry(events: ClusterEvents): void {
  if (arpMode) for (const m of events.born) arpIds.add(m.id);
  for (const id of events.died) arpIds.delete(id);
}
```

1f. In `tick()`: call `updateArpRegistry(events);` immediately after `const events = tracker.update(...)`, and extend the mapper call:

```ts
mapper.handleTick(events, births, engine.population(), 1 / rate, GRID, GRID, arpIds);
```

1g. In `refresh()`: same — `updateArpRegistry(events);` right after the tracker update, and the non-silent branch passes `arpIds`:

```ts
mapper.handleTick(events, [], engine.population(), 1 / rate, GRID, GRID, arpIds);
```

1h. Arp panel wiring, after the existing `buildControls(...)` block:

```ts
const arpUi = buildArpPanel(arpPanelRoot, {
  onModeToggle() {
    toggleArpMode();
  },
  onArpVolume(db) {
    mapper.setArpVolume(db);
  },
  onArpMaxNotes(n) {
    mapper.setArpMaxNotes(n);
  },
  onArpInstrument(instrument) {
    mapper.setArpInstrument(instrument);
  },
  onArpJitter(pct) {
    mapper.setArpJitter(pct);
  },
});

function toggleArpMode(): void {
  arpMode = !arpMode;
  arpUi.setMode(arpMode);
}
```

1i. Extend the existing keydown listener:

```ts
window.addEventListener('keydown', ev => {
  if (ev.key === 'r' || ev.key === 'R') {
    rotation = (rotation + 1) % 4;
    updatePreview();
  }
  if (ev.key === 'a' || ev.key === 'A') toggleArpMode();
});
```

1j. Append to `docs/smoke-test.md`:

```markdown
14. **Arpeggio riffs**: press `A` (panel button lights up amber), stamp a
    Pulsar; instead of a pad it plays a cyclic riff that mutates through its
    period-3 cycle, and its cells draw hollow.
15. **Mode isolation**: with pads sounding, toggle arpeggio mode on and off;
    nothing already playing changes. New stamps follow the current mode.
16. **Arp controls**: arp volume attenuates only the riffs; max notes/gen
    audibly thins a tall pattern; each instrument sounds distinct; jitter at
    5% loosens timing, 0% locks it.
```

1k. In `README.md`, after the "R rotates the armed pattern" sentence in the Run section, add:

```markdown
Press `A` to toggle arpeggio mode: patterns placed while it is on become
piano-roll arpeggios (drawn as hollow cells) instead of pads — rows play
top-down across each generation, cell position sets the scale degree.
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: all clean/green.

Run: `npm run dev`, confirm the server starts and serves the page (curl if headless); audible checks are the smoke-test items.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts docs/smoke-test.md README.md
git commit -m "feat: arpeggio mode toggle, registry plumbing, and arp panel wiring"
```
