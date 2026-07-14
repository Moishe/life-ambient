# Mood Worlds — implementation plan (2026-07-14)

Spec: `docs/superpowers/specs/2026-07-14-mood-worlds-design.md`. Read it first.

Three tasks. 1 and 2 are independent pure modules (complete code below — transcribe
faithfully; if you spot a bug, fix it AND flag it in your report). Task 3 wires them
into the UI and depends on both.

Branch: `feat/mood-worlds`. Run `npm test` and `npm run typecheck` before reporting done.

---

## Task 1 — world codec (`src/world/codec.ts` + `tests/world-codec.test.ts`)

New directory `src/world/`. Pure module, no Tone, no DOM.

```ts
// src/world/codec.ts
import { KEYS, SCALES, type KeyName, type ScaleName } from '../audio/scale';
import type { ArpInstrument } from '../audio/arpeggio';
import type { Cell } from '../engine/life';

// Serialization orders are pinned and append-only: reordering or removing an
// entry silently changes what old share links decode to. Append new entries at
// the end, never in the middle.
export const SCALE_ORDER: readonly ScaleName[] = [
  'majorPentatonic',
  'minorPentatonic',
  'lydian',
  'dorian',
  'wholeTone',
  'aeolian',
];
export const INSTRUMENT_ORDER: readonly ArpInstrument[] = ['pluck', 'bell', 'keys'];

export interface WorldSettings {
  rate: number; // generations/sec, integer 1..8
  key: KeyName;
  scale: ScaleName;
  masterDb: number;
  arpMode: boolean;
  arpDb: number;
  arpMaxNotes: number;
  arpInstrument: ArpInstrument;
  arpJitterPct: number;
}

export interface WorldState {
  cells: Cell[];
  settings: WorldSettings;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function packBits(bits: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  return bytes;
}

function unpackBits(bytes: Uint8Array, bitLen: number): Uint8Array {
  const bits = new Uint8Array(bitLen);
  for (let i = 0; i < bitLen; i++) {
    bits[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  }
  return bits;
}

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += B64[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += B64[b2 & 63];
  }
  return out;
}

function fromBase64Url(s: string, byteLen: number): Uint8Array | null {
  if (s.length !== Math.ceil((byteLen * 8) / 6)) return null;
  const out = new Uint8Array(byteLen);
  let buf = 0;
  let bitCount = 0;
  let oi = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buf = (buf << 6) | v;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      if (oi < byteLen) out[oi++] = (buf >> bitCount) & 0xff;
    }
  }
  return oi === byteLen ? out : null;
}

// Linear RLE over the row-major grid: `<count>b` dead, `<count>o` alive,
// trailing dead run omitted. Empty string = empty board.
function encodeRle(bits: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bits.length) {
    const v = bits[i];
    let j = i + 1;
    while (j < bits.length && bits[j] === v) j++;
    if (v === 1 || j < bits.length) out += String(j - i) + (v ? 'o' : 'b');
    i = j;
  }
  return out;
}

function decodeRle(s: string, bitLen: number): Uint8Array | null {
  const bits = new Uint8Array(bitLen);
  let pos = 0;
  const re = /(\d+)([bo])/gy; // sticky: any stray character stops the scan
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(s)) !== null) {
    const run = Number(m[1]);
    if (run === 0 || pos + run > bitLen) return null;
    if (m[2] === 'o') bits.fill(1, pos, pos + run);
    pos += run;
    consumed = re.lastIndex;
  }
  if (consumed !== s.length) return null; // malformed tail
  return bits;
}

/** Version-1 wire format, `~`-joined:
 *  1~gridW~gridH~rate~keyIdx~scaleIdx~masterDb~arp01~arpDb~maxNotes~instIdx~jitter~board
 *  board = 'r' + RLE  or  'x' + base64url raw bitmap, whichever is shorter. */
export function serializeWorld(state: WorldState, gridW: number, gridH: number): string {
  const bits = new Uint8Array(gridW * gridH);
  for (const c of state.cells) {
    if (c.x >= 0 && c.y >= 0 && c.x < gridW && c.y < gridH) bits[c.y * gridW + c.x] = 1;
  }
  const rle = 'r' + encodeRle(bits);
  const raw = 'x' + toBase64Url(packBits(bits));
  const s = state.settings;
  return [
    1,
    gridW,
    gridH,
    s.rate,
    KEYS.indexOf(s.key),
    SCALE_ORDER.indexOf(s.scale),
    s.masterDb,
    s.arpMode ? 1 : 0,
    s.arpDb,
    s.arpMaxNotes,
    INSTRUMENT_ORDER.indexOf(s.arpInstrument),
    s.arpJitterPct,
    rle.length <= raw.length ? rle : raw,
  ].join('~');
}

function parseNum(s: string): number | null {
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

function intIn(s: string, lo: number, hi: number): number | null {
  const n = parseNum(s);
  return n !== null && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

function floatIn(s: string, lo: number, hi: number): number | null {
  const n = parseNum(s);
  return n !== null && n >= lo && n <= hi ? n : null;
}

/** Defensive: share links are untrusted input. Any malformed field → null.
 *  Ranges are looser than the UI sliders on purpose (forward compatibility);
 *  cells beyond the live grid are dropped by engine.set at apply time. */
export function deserializeWorld(text: string): WorldState | null {
  const parts = text.split('~');
  if (parts.length !== 13 || parts[0] !== '1') return null;
  const gridW = intIn(parts[1], 1, 512);
  const gridH = intIn(parts[2], 1, 512);
  const rate = intIn(parts[3], 1, 8);
  const keyIdx = intIn(parts[4], 0, KEYS.length - 1);
  const scaleIdx = intIn(parts[5], 0, SCALE_ORDER.length - 1);
  const masterDb = floatIn(parts[6], -60, 0);
  const arpMode = parts[7] === '1' ? true : parts[7] === '0' ? false : null;
  const arpDb = floatIn(parts[8], -60, 0);
  const arpMaxNotes = intIn(parts[9], 1, 32);
  const instIdx = intIn(parts[10], 0, INSTRUMENT_ORDER.length - 1);
  const arpJitterPct = floatIn(parts[11], 0, 10);
  if (
    gridW === null || gridH === null || rate === null || keyIdx === null ||
    scaleIdx === null || masterDb === null || arpMode === null || arpDb === null ||
    arpMaxNotes === null || instIdx === null || arpJitterPct === null
  ) {
    return null;
  }

  const board = parts[12];
  const bitLen = gridW * gridH;
  let bits: Uint8Array | null = null;
  if (board.startsWith('r')) {
    bits = decodeRle(board.slice(1), bitLen);
  } else if (board.startsWith('x')) {
    const bytes = fromBase64Url(board.slice(1), Math.ceil(bitLen / 8));
    bits = bytes && unpackBits(bytes, bitLen);
  }
  if (!bits) return null;

  const cells: Cell[] = [];
  for (let i = 0; i < bitLen; i++) {
    if (bits[i]) cells.push({ x: i % gridW, y: Math.floor(i / gridW) });
  }
  return {
    cells,
    settings: {
      rate,
      key: KEYS[keyIdx],
      scale: SCALE_ORDER[scaleIdx],
      masterDb,
      arpMode,
      arpDb,
      arpMaxNotes,
      arpInstrument: INSTRUMENT_ORDER[instIdx],
      arpJitterPct,
    },
  };
}
```

### Tests (`tests/world-codec.test.ts`)

Match the style of existing tests in `tests/`. Cover at minimum:

- `SCALE_ORDER` contains exactly the keys of `SCALES` (set equality) — pins the
  append-only contract against new scales being forgotten.
- Round-trip identity (cells compared as sorted `x,y` strings; settings deep-equal)
  for: empty board; single cell at (0,0) and (95,95); a scattered sparse board;
  a full board (all alive); an alternating checkerboard.
- Sparse board serializes with an `r` board field; checkerboard/full pick `x`
  (assert the serializer chose the shorter encoding, i.e. board field prefix).
- All 12 keys and all 6 scales and all 3 instruments survive a round trip.
- Out-of-bounds cells in input are silently dropped by serialize (serialize a
  state containing `{x: -1, y: 0}` and `{x: 96, y: 5}` → deserialize has neither).
- `deserializeWorld` returns null for: wrong version (`2~...`), wrong field count,
  rate 0 and 9, keyIdx 12, scaleIdx 6, instIdx 3, non-numeric rate, masterDb 5
  (positive), RLE with a stray char (`r3b2z1o`), RLE overrunning the grid
  (`r10000o` on 96×96), RLE with a zero run (`r0b`), truncated base64 board,
  base64 with an invalid char, empty string, plain garbage.
- RLE with trailing dead run omitted decodes (e.g. hand-built `1~4~4~...~r1o`
  → exactly one live cell at (0,0) on a 4×4 grid).

## Task 2 — mood recipes + generator (`src/world/moods.ts` + `tests/world-moods.test.ts`)

Pure module. Uses `PATTERNS`/`rotateCells` from `src/engine/patterns.ts`. RNG is
injected (`Rng = () => number`, Math.random-compatible) so tests seed it.

```ts
// src/world/moods.ts
import { PATTERNS, rotateCells, type Pattern } from '../engine/patterns';
import { KEYS, type ScaleName } from '../audio/scale';
import type { ArpInstrument } from '../audio/arpeggio';
import type { Cell } from '../engine/life';
import type { WorldState } from './codec';

export type Rng = () => number;

export interface MoodGroup {
  patternIds: string[];
  count: [number, number]; // inclusive range of instances to place
}

export interface Mood {
  id: string;
  name: string;
  tagline: string;
  rateRange: [number, number];
  scales: ScaleName[];
  arpMode: boolean;
  arpInstrument?: ArpInstrument; // only set when the mood claims the arp sound
  groups: MoodGroup[];
}

export interface Placement {
  pattern: Pattern;
  x: number;
  y: number;
  rotation: number; // quarter turns CW
}

/** Volumes and arp texture are room decisions, not mood decisions: moods pass
 *  the user's current values through untouched (except instrument, when the
 *  mood claims it). */
export interface MoodBase {
  masterDb: number;
  arpDb: number;
  arpMaxNotes: number;
  arpInstrument: ArpInstrument;
  arpJitterPct: number;
}

export const MARGIN = 4; // min distance from the walls
export const GAP = 6; // min Chebyshev gap between bounding boxes; tracker joins at ≤ 2
const TRIES = 80; // placement attempts per instance before giving up (best-effort)

const DRONES = ['block', 'beehive', 'loaf', 'pond'];

export const MOODS: readonly Mood[] = [
  {
    id: 'stillness',
    name: 'Still Waters',
    tagline: 'sparse drones, slow shimmer',
    rateRange: [1, 2],
    scales: ['majorPentatonic', 'lydian'],
    arpMode: false,
    groups: [
      { patternIds: DRONES, count: [6, 9] },
      { patternIds: ['blinker'], count: [1, 2] },
    ],
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    tagline: 'patient oscillators',
    rateRange: [3, 4],
    scales: ['dorian', 'aeolian'],
    arpMode: false,
    groups: [
      { patternIds: ['blinker', 'toad', 'beacon'], count: [4, 7] },
      { patternIds: ['pulsar'], count: [1, 1] },
      { patternIds: ['pentadecathlon'], count: [0, 1] },
    ],
  },
  {
    id: 'voyagers',
    name: 'Voyagers',
    tagline: 'travellers over a quiet floor',
    rateRange: [4, 5],
    scales: ['lydian', 'wholeTone'],
    arpMode: false,
    groups: [
      { patternIds: ['glider'], count: [3, 5] },
      { patternIds: ['lwss'], count: [1, 2] },
      { patternIds: DRONES, count: [2, 3] },
    ],
  },
  {
    id: 'musicbox',
    name: 'Music Box',
    tagline: 'everything chimes',
    rateRange: [2, 3],
    scales: ['majorPentatonic'],
    arpMode: true,
    arpInstrument: 'bell',
    groups: [
      { patternIds: DRONES, count: [3, 5] },
      { patternIds: ['blinker', 'toad'], count: [2, 4] },
      { patternIds: ['pulsar'], count: [0, 1] },
    ],
  },
  {
    id: 'fountain',
    name: 'Fountain',
    tagline: 'an endless spring of gliders',
    rateRange: [4, 4],
    scales: ['dorian'],
    arpMode: false,
    groups: [
      { patternIds: ['gosperGun'], count: [1, 1] },
      { patternIds: DRONES, count: [2, 4] },
    ],
  },
  {
    id: 'tempest',
    name: 'Tempest',
    tagline: 'chaos blooming',
    rateRange: [6, 8],
    scales: ['minorPentatonic', 'wholeTone'],
    arpMode: false,
    groups: [
      { patternIds: ['rPentomino'], count: [1, 2] },
      { patternIds: ['acorn'], count: [1, 1] },
      { patternIds: ['glider'], count: [2, 3] },
    ],
  },
];

function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pickOne<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function byId(id: string): Pattern {
  const p = PATTERNS.find(p => p.id === id);
  if (!p) throw new Error(`unknown pattern id in mood: ${id}`);
  return p;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function separated(a: Box, b: Box, gap: number): boolean {
  return (
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

/** Roll placements for a mood: random pattern choice per group instance, random
 *  rotation, random position keeping MARGIN off the walls and ≥ GAP between
 *  bounding boxes so every placement starts as its own cluster. Best-effort:
 *  an instance that can't find a spot in TRIES attempts is skipped. */
export function planMood(mood: Mood, gridW: number, gridH: number, rng: Rng): Placement[] {
  const placements: Placement[] = [];
  const boxes: Box[] = [];
  for (const group of mood.groups) {
    const n = randInt(rng, group.count[0], group.count[1]);
    for (let i = 0; i < n; i++) {
      const pattern = byId(pickOne(rng, group.patternIds));
      const rotation = randInt(rng, 0, 3);
      const w = rotation % 2 === 0 ? pattern.width : pattern.height;
      const h = rotation % 2 === 0 ? pattern.height : pattern.width;
      if (w + 2 * MARGIN > gridW || h + 2 * MARGIN > gridH) continue;
      for (let attempt = 0; attempt < TRIES; attempt++) {
        const x = randInt(rng, MARGIN, gridW - MARGIN - w);
        const y = randInt(rng, MARGIN, gridH - MARGIN - h);
        const box = { x, y, w, h };
        if (boxes.every(b => separated(b, box, GAP))) {
          boxes.push(box);
          placements.push({ pattern, x, y, rotation });
          break;
        }
      }
    }
  }
  return placements;
}

export function generateMoodWorld(
  mood: Mood,
  gridW: number,
  gridH: number,
  rng: Rng,
  base: MoodBase,
): WorldState {
  const cells: Cell[] = [];
  for (const p of planMood(mood, gridW, gridH, rng)) {
    for (const c of rotateCells(p.pattern.cells, p.rotation)) {
      cells.push({ x: p.x + c.x, y: p.y + c.y });
    }
  }
  return {
    cells,
    settings: {
      rate: randInt(rng, mood.rateRange[0], mood.rateRange[1]),
      key: pickOne(rng, KEYS),
      scale: pickOne(rng, mood.scales),
      masterDb: base.masterDb,
      arpMode: mood.arpMode,
      arpDb: base.arpDb,
      arpMaxNotes: base.arpMaxNotes,
      arpInstrument: mood.arpInstrument ?? base.arpInstrument,
      arpJitterPct: base.arpJitterPct,
    },
  };
}
```

### Tests (`tests/world-moods.test.ts`)

Seeded RNG — include this helper in the test file:

```ts
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Cover, for EVERY mood in MOODS across at least seeds 1..10 (96×96 grid):

- Every `patternIds` entry in every mood resolves to a real pattern id.
- All generated cells are within bounds — in fact within `[MARGIN, 96 - MARGIN)`.
- No duplicate cells (separation implies disjoint patterns; pins it).
- Recomputed bounding boxes of `planMood` placements (rotation parity swaps w/h)
  pairwise satisfy the GAP separation.
- Placement count ≤ sum of group maxima, and > 0 for these seeds.
- Determinism: same seed → `planMood` returns deep-equal placements.
- `generateMoodWorld` settings: rate within `rateRange` (integer), scale ∈
  `mood.scales`, key ∈ KEYS, `arpMode` matches the mood, base volumes/notes/jitter
  pass through, instrument is the mood's when set (musicbox → 'bell') else the
  base's.
- Fountain across seeds 1..10 always places the Gosper gun (a 36-wide pattern
  must fit even when rotated: its rotated bbox is 9×36, fine on 96).

## Task 3 — wiring: panels, setters, main, HTML/CSS, docs

Depends on Tasks 1–2 being merged into the branch. Read `src/main.ts`,
`src/ui/controls.ts`, `index.html`, `src/style.css` before writing.

### 3a. `SoundMapper.snapshotSettings()` (src/audio/soundMapper.ts)

```ts
/** Current mixer/arp settings, for world snapshots and mood bases. */
snapshotSettings(): {
  masterDb: number;
  arpDb: number;
  arpMaxNotes: number;
  arpInstrument: ArpInstrument;
  arpJitterPct: number;
} {
  return {
    masterDb: this.masterDb,
    arpDb: this.arpDb,
    arpMaxNotes: this.arpMaxNotes,
    arpInstrument: this.arpInstrument,
    arpJitterPct: this.arpJitterPct,
  };
}
```

This intentionally matches `MoodBase` from moods.ts. No behavior change.

### 3b. controls.ts — setters + two new panels

- `buildControls` return object gains `setRate(gps: number)`, `setKey(key: KeyName)`,
  `setScale(scale: ScaleName)`, `setVolume(db: number)`. Each sets the element's
  `.value` ONLY — never fires the callback (applyWorld already updates the mapper;
  firing would double-apply and invite loops).
- `buildArpPanel` return gains
  `setSettings(s: { db: number; maxNotes: number; instrument: ArpInstrument; jitterPct: number }): void`
  — same rule, element values only.
- **Gotcha (must handle):** `main.ts` arms the default paint tool with
  `paletteRoot.querySelector('button')?.click()`. The mood panel will now own the
  FIRST buttons in the palette, so that line would apply a mood on load. Fix:
  give every tool button created in `buildControls` a class `tool`
  (`btn.classList.add('tool')`), give mood buttons class `mood`, and change main
  to `paletteRoot.querySelector<HTMLButtonElement>('button.tool')?.click()`.
- New `buildMoodPanel(root, moods, cb)`:

```ts
export interface MoodButton {
  id: string;
  name: string;
  tagline: string;
}

export function buildMoodPanel(
  root: HTMLElement,
  moods: readonly MoodButton[],
  cb: { onMood(id: string): void },
): void {
  const heading = document.createElement('h3');
  heading.textContent = 'Moods';
  root.appendChild(heading);
  for (const mood of moods) {
    const btn = document.createElement('button');
    btn.textContent = mood.name;
    btn.title = mood.tagline;
    btn.classList.add('mood');
    btn.addEventListener('click', () => cb.onMood(mood.id));
    root.appendChild(btn);
  }
}
```

  Note the UI-layer rule: controls.ts must NOT import from `src/world/` beyond
  types — pass plain `{id, name, tagline}` data (map `MOODS` in main). It already
  only receives data + callbacks; keep it that way.

- New `buildWorldPanel(root, cb)` returning `{ setSavedNames(names: string[]): void }`:
  - heading 'Worlds';
  - Save button → `const name = prompt('Name this world'); if (name?.trim()) cb.onSaveRequest(name.trim())`;
  - a `<select>` of saved names + Load and Delete buttons wired to
    `cb.onLoadRequest(select.value)` / `cb.onDeleteRequest(select.value)`, both
    disabled when the list is empty (`setSavedNames` refreshes options and the
    disabled state, preserving the current selection when it survives);
  - Share button → `cb.onShareRequest(): Promise<boolean>`; while resolving do
    nothing, on true show 'Copied!' on the button for 1.5 s then restore the
    label, on false show 'Copy failed'.

### 3c. index.html + style.css

Right sidebar becomes a column holding both panels:

```html
<aside id="side-panel">
  <div id="arp-panel"></div>
  <div id="world-panel"></div>
</aside>
```

Update `src/style.css`: whatever layout rules target `#arp-panel` as the sidebar
(width, padding, background) move to `#side-panel`; `#arp-panel`/`#world-panel`
keep the inner stacking styles. Mood buttons in the left palette can reuse the
existing palette button styles; give `.mood` a subtle accent if trivial, skip if
not. Keep this minimal — no redesign.

### 3d. main.ts wiring

Order of new code matters; integrate in this shape:

```ts
import { serializeWorld, deserializeWorld, type WorldState } from './world/codec';
import { MOODS, generateMoodWorld } from './world/moods';
// + buildMoodPanel, buildWorldPanel from './ui/controls'

const STORAGE_KEY = 'life-ambient.worlds.v1';

function readSavedWorlds(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function writeSavedWorlds(map: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage full or blocked: saving silently fails, sharing still works
  }
}

function currentWorld(): WorldState {
  return {
    cells: engine.liveCells(),
    settings: { rate, key: mapper.key, scale: mapper.scale, arpMode, ...mapper.snapshotSettings() },
  };
}

/** Replace the whole world. Settings go first — arp mode BEFORE the board
 *  refresh, because the arp registry only admits clusters born while the mode
 *  is on. Board last, with click-editing semantics (silent while paused; the
 *  orphan reconcile settles voices on resume). */
function applyWorld(state: WorldState): void {
  const s = state.settings;
  rate = s.rate;
  scheduleLoop();
  ui.setRate(s.rate);
  mapper.setKeyScale(s.key, s.scale);
  ui.setKey(s.key);
  ui.setScale(s.scale);
  mapper.setMasterVolume(s.masterDb);
  ui.setVolume(s.masterDb);
  mapper.setArpVolume(s.arpDb);
  mapper.setArpMaxNotes(s.arpMaxNotes);
  mapper.setArpInstrument(s.arpInstrument);
  mapper.setArpJitter(s.arpJitterPct);
  arpUi.setSettings({
    db: s.arpDb,
    maxNotes: s.arpMaxNotes,
    instrument: s.arpInstrument,
    jitterPct: s.arpJitterPct,
  });
  if (arpMode !== s.arpMode) toggleArpMode();
  engine.clear();
  for (const c of state.cells) engine.set(c.x, c.y, true);
  refresh(!playing);
}
```

- Mood panel (call BEFORE `buildControls` so mood buttons sit at the top of the
  palette; remember the `button.tool` fix from 3b):

```ts
buildMoodPanel(paletteRoot, MOODS.map(m => ({ id: m.id, name: m.name, tagline: m.tagline })), {
  onMood(id) {
    const mood = MOODS.find(m => m.id === id);
    if (mood) applyWorld(generateMoodWorld(mood, GRID, GRID, Math.random, mapper.snapshotSettings()));
  },
});
```

- World panel (`const worldUi = buildWorldPanel(worldPanelRoot, {...})` — the
  callbacks may reference `worldUi`; they only fire after construction):
  - save: read map, `map[name] = serializeWorld(currentWorld(), GRID, GRID)`,
    write, `worldUi.setSavedNames(Object.keys(map).sort())`. Overwriting an
    existing name is intended (it's how you update a save).
  - load: `deserializeWorld(map[name])`; apply only if non-null.
  - delete: remove key, write, refresh names.
  - share: `` `${location.origin}${location.pathname}#w=${serializeWorld(currentWorld(), GRID, GRID)}` ``
    → `navigator.clipboard.writeText`, return true/false. (pathname keeps the
    `/life-ambient/` Pages base intact.)
  - after construction: `worldUi.setSavedNames(Object.keys(readSavedWorlds()).sort())`.
- URL worlds: parse once at startup —
  `const m = location.hash.match(/^#w=(.+)$/); const pendingWorld = m ? deserializeWorld(m[1]) : null;`
  In the start-button handler, after `Tone.getTransport().start()` /
  `ui.setPlaying(true)`: `if (pendingWorld) applyWorld(pendingWorld);`
- `#world-panel` root element: query it alongside the other roots and add it to
  the missing-elements guard.

### 3e. Docs

- `docs/smoke-test.md`: append items 17–22: (17) click Still Waters — board
  repopulates, speed/key/scale controls jump to match, calm sparse soundscape;
  click it again — different arrangement. (18) apply a mood while sound is
  playing — old pads fade, no stuck voices. (19) Music Box — arp toggle lights
  up, clusters chime (bells), cells draw hollow. (20) save a world, apply
  Tempest, load the save — exact board and settings return. (21) Share link —
  paste in a new tab, tap start: the same world plays. (22) pause, apply a mood
  — silent until play, then fades in.
- `CLAUDE.md`: add `src/world/codec.ts` and `src/world/moods.ts` rows to the
  architecture table; in the sound-model section add one bullet: mood/world
  apply sets settings (arp mode included) BEFORE repopulating the board, and a
  loaded world with arp mode on makes ALL its clusters arps (membership is not
  serialized). Note the pinned append-only SCALE_ORDER/INSTRUMENT_ORDER contract.

### Task 3 acceptance

`npm test` green, `npm run typecheck` clean, `npm run build` succeeds. Manual:
dev server, mood buttons produce coherent worlds and re-roll, save/load/share
round-trip via the panel, `#w=` link recreates a world after the gate, paint
tool still armed by default on load (not a mood).
