# Life Ambient Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser app where the user composes ambient music by placing Conway's Life patterns on a grid; clusters of living cells become pad voices, births become percussive pings.

**Architecture:** Four plain TypeScript modules with strict boundaries — `LifeEngine` (pure simulation) → `ClusterTracker` (pure analysis, stable cluster identities + metrics) → `SoundMapper` (all Tone.js audio) — wired together by a thin UI layer (canvas renderer + DOM controls). The simulation ticks on Tone.js's Transport so audio is sample-accurately scheduled.

**Tech Stack:** TypeScript (strict), Vite, Vitest, Tone.js (only runtime dependency), Canvas 2D, plain DOM.

**Spec:** `docs/superpowers/specs/2026-07-13-life-ambient-music-design.md` — read it before starting any task.

**Model guidance (per user preference, execute tasks with less-expensive models):** Tasks 1, 6, 7, 12 → Haiku. Tasks 2, 3, 4, 9, 10 → Sonnet. Tasks 5, 8, 11 → Opus (trickiest logic/wiring). All code is given in full below, so the executing model mostly transcribes, runs, and verifies.

## Global Constraints

- Grid is 96×96, bounded (NO wraparound; out-of-bounds cells are permanently dead).
- Conway rules B3/S23 exactly.
- Max 16 concurrent pad voices; smallest clusters lose their voice first.
- Max 12 birth pings per tick, micro-staggered across 80 ms.
- Deaths make no sound.
- Cluster grouping distance: Chebyshev ≤ 2 (one-cell gaps allowed).
- Pitch: radial distance from grid center → scale degrees across 2 octaves, always quantized to selected key + scale. Pad register base C3 (MIDI 48); pings two octaves up (MIDI 72).
- TypeScript `strict: true`; `npm run typecheck` must pass at every commit.
- Only runtime dependency: `tone`. No UI framework.
- All test commands use Vitest: `npx vitest run <file>`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `index.html`, `src/style.css`, `src/main.ts`, `tests/smoke.test.ts`, `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a Vite + Vitest + TypeScript project where `npm run typecheck`, `npx vitest run`, and `npm run build` succeed. Later tasks create files under `src/` and `tests/`.

- [ ] **Step 1: Write project files**

`package.json`:

```json
{
  "name": "life-ambient",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "tone": "^15.1.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src", "tests"]
}
```

`.gitignore`:

```
node_modules/
dist/
```

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Life Ambient</title>
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
  <div id="app">
    <aside id="palette"></aside>
    <main>
      <div id="controls"></div>
      <canvas id="board" width="768" height="768"></canvas>
    </main>
  </div>
  <div id="gate"><button id="start-btn">&#9654; tap to start audio</button></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

`src/style.css`:

```css
:root { color-scheme: dark; }
* { box-sizing: border-box; margin: 0; }
body { background: #0b0e14; color: #c8ccd4; font: 14px/1.4 system-ui, sans-serif; }
#app { display: flex; gap: 16px; padding: 16px; }
#palette { width: 180px; display: flex; flex-direction: column; gap: 4px; }
#palette h3 { margin: 10px 0 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; }
#palette button { text-align: left; padding: 6px 8px; background: #151a24; color: inherit; border: 1px solid #232936; border-radius: 6px; cursor: pointer; }
#palette button.selected { border-color: #7aa2f7; color: #7aa2f7; }
#controls { display: flex; align-items: center; gap: 12px; padding: 8px 0 12px; flex-wrap: wrap; }
#controls label { display: flex; align-items: center; gap: 6px; color: #9aa1ad; }
#controls select, #controls button { background: #151a24; color: inherit; border: 1px solid #232936; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
#board { border: 1px solid #232936; border-radius: 8px; cursor: crosshair; }
#gate { position: fixed; inset: 0; background: rgba(11, 14, 20, 0.92); display: flex; align-items: center; justify-content: center; }
#gate button { font-size: 20px; padding: 16px 32px; background: #151a24; color: #c8ccd4; border: 1px solid #7aa2f7; border-radius: 12px; cursor: pointer; }
#gate.hidden { display: none; }
```

`src/main.ts` (placeholder, replaced in Task 11):

```ts
console.log('life-ambient scaffold');
export {};
```

`tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Install and verify**

Run: `npm install`
Expected: completes without errors; `node_modules/` created.

Run: `npx vitest run`
Expected: 1 passed.

Run: `npm run typecheck`
Expected: exits 0, no output.

Run: `npm run build`
Expected: `dist/` produced without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore index.html src/ tests/
git commit -m "chore: scaffold Vite + TypeScript + Vitest + Tone.js project"
```

---

### Task 2: LifeEngine

**Files:**
- Create: `src/engine/life.ts`
- Test: `tests/life.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Cell { x: number; y: number }`
  - `interface TickResult { births: Cell[]; deaths: Cell[] }`
  - `class LifeEngine { constructor(width?: number, height?: number); readonly width: number; readonly height: number; get(x: number, y: number): boolean; set(x: number, y: number, alive: boolean): void; clear(): void; liveCells(): Cell[]; population(): number; tick(): TickResult }`
  - Default constructor size 96×96. Bounded grid: `get` outside bounds returns `false`; `set` outside bounds is a no-op.

- [ ] **Step 1: Write the failing test**

`tests/life.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LifeEngine } from '../src/engine/life';

function setCells(e: LifeEngine, cells: [number, number][]) {
  for (const [x, y] of cells) e.set(x, y, true);
}

describe('LifeEngine', () => {
  it('defaults to 96x96 and starts empty', () => {
    const e = new LifeEngine();
    expect(e.width).toBe(96);
    expect(e.height).toBe(96);
    expect(e.population()).toBe(0);
  });

  it('is bounded: out-of-range get is false, set is a no-op', () => {
    const e = new LifeEngine(10, 10);
    expect(e.get(-1, 0)).toBe(false);
    expect(e.get(0, 10)).toBe(false);
    e.set(-1, 0, true);
    e.set(10, 5, true);
    expect(e.population()).toBe(0);
  });

  it('keeps a block (still life) stable with no births or deaths', () => {
    const e = new LifeEngine(10, 10);
    setCells(e, [[4, 4], [5, 4], [4, 5], [5, 5]]);
    const r = e.tick();
    expect(r.births).toHaveLength(0);
    expect(r.deaths).toHaveLength(0);
    expect(e.population()).toBe(4);
  });

  it('oscillates a blinker with period 2', () => {
    const e = new LifeEngine(10, 10);
    setCells(e, [[3, 5], [4, 5], [5, 5]]); // horizontal
    const r1 = e.tick();
    expect(e.liveCells()).toEqual([
      { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 },
    ]); // vertical
    expect(r1.births).toHaveLength(2);
    expect(r1.deaths).toHaveLength(2);
    e.tick();
    expect(e.liveCells()).toEqual([
      { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 },
    ]); // horizontal again
  });

  it('moves a glider one cell down-right every 4 generations', () => {
    const e = new LifeEngine(20, 20);
    // glider: .#. / ..# / ### at origin (1,1)
    setCells(e, [[2, 1], [3, 2], [1, 3], [2, 3], [3, 3]]);
    for (let i = 0; i < 4; i++) e.tick();
    expect(new Set(e.liveCells().map(c => `${c.x},${c.y}`))).toEqual(
      new Set(['3,2', '4,3', '2,4', '3,4', '4,4']),
    );
  });

  it('clear() empties the board', () => {
    const e = new LifeEngine(10, 10);
    setCells(e, [[1, 1], [2, 2]]);
    e.clear();
    expect(e.population()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/life.test.ts`
Expected: FAIL — cannot resolve `../src/engine/life`.

- [ ] **Step 3: Write the implementation**

`src/engine/life.ts`:

```ts
export interface Cell {
  x: number;
  y: number;
}

export interface TickResult {
  births: Cell[];
  deaths: Cell[];
}

export class LifeEngine {
  readonly width: number;
  readonly height: number;
  private cells: Uint8Array;
  private next: Uint8Array;

  constructor(width = 96, height = 96) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
    this.next = new Uint8Array(width * height);
  }

  get(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.cells[y * this.width + x] === 1;
  }

  set(x: number, y: number, alive: boolean): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y * this.width + x] = alive ? 1 : 0;
  }

  clear(): void {
    this.cells.fill(0);
  }

  liveCells(): Cell[] {
    const out: Cell[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.cells[y * this.width + x] === 1) out.push({ x, y });
      }
    }
    return out;
  }

  population(): number {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) n += this.cells[i];
    return n;
  }

  tick(): TickResult {
    const births: Cell[] = [];
    const deaths: Cell[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (this.get(x + dx, y + dy)) n++;
          }
        }
        const alive = this.cells[y * this.width + x] === 1;
        const lives = alive ? n === 2 || n === 3 : n === 3;
        this.next[y * this.width + x] = lives ? 1 : 0;
        if (lives && !alive) births.push({ x, y });
        if (!lives && alive) deaths.push({ x, y });
      }
    }
    [this.cells, this.next] = [this.next, this.cells];
    return { births, deaths };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/life.test.ts`
Expected: PASS (6 tests).

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/life.ts tests/life.test.ts
git commit -m "feat: LifeEngine with bounded 96x96 grid, B3/S23 rules, birth/death diff"
```

---

### Task 3: Pattern library

**Files:**
- Create: `src/engine/patterns.ts`
- Test: `tests/patterns.test.ts`

**Interfaces:**
- Consumes: `Cell`, `LifeEngine` from `src/engine/life.ts`.
- Produces:
  - `type PatternCategory = 'drone' | 'pulse' | 'voyager' | 'fountain' | 'wildcard'`
  - `interface Pattern { id: string; name: string; category: PatternCategory; cells: Cell[]; width: number; height: number }`
  - `const PATTERNS: Pattern[]` — 14 patterns (see test for ids).
  - `function fromRows(rows: string[]): Cell[]` — `'#'` = live cell.
  - `function rotateCells(cells: Cell[], quarterTurns: number): Cell[]` — rotates 90° clockwise per turn, result coordinates non-negative.
  - `function placePattern(engine: LifeEngine, pattern: Pattern, ox: number, oy: number, quarterTurns?: number): void`
  - Note: the spec's "glider ×4 orientations" is delivered via rotation (`R` key in UI), not four palette entries.

- [ ] **Step 1: Write the failing test**

`tests/patterns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LifeEngine } from '../src/engine/life';
import { PATTERNS, fromRows, rotateCells, placePattern } from '../src/engine/patterns';

const byId = (id: string) => {
  const p = PATTERNS.find(p => p.id === id);
  if (!p) throw new Error(`missing pattern ${id}`);
  return p;
};

const cellSet = (cells: { x: number; y: number }[]) =>
  new Set(cells.map(c => `${c.x},${c.y}`));

describe('pattern library', () => {
  it('contains the full curated palette', () => {
    expect(PATTERNS.map(p => p.id).sort()).toEqual(
      [
        'acorn', 'beacon', 'beehive', 'blinker', 'block', 'glider',
        'gosperGun', 'loaf', 'lwss', 'pentadecathlon', 'pond',
        'pulsar', 'rPentomino', 'toad',
      ].sort(),
    );
  });

  it('has correct cell counts for known patterns', () => {
    expect(byId('block').cells).toHaveLength(4);
    expect(byId('pulsar').cells).toHaveLength(48);
    expect(byId('gosperGun').cells).toHaveLength(36);
    expect(byId('rPentomino').cells).toHaveLength(5);
    expect(byId('acorn').cells).toHaveLength(7);
    expect(byId('lwss').cells).toHaveLength(9);
  });

  it('parses rows into cells', () => {
    expect(cellSet(fromRows(['#.', '.#']))).toEqual(new Set(['0,0', '1,1']));
  });

  it('rotates a blinker from horizontal to vertical', () => {
    const rotated = rotateCells(fromRows(['###']), 1);
    expect(cellSet(rotated)).toEqual(new Set(['0,0', '0,1', '0,2']));
  });

  it('returns to the original shape after 4 rotations', () => {
    const glider = byId('glider').cells;
    expect(cellSet(rotateCells(glider, 4))).toEqual(cellSet(glider));
  });

  it('still lifes are stable when placed', () => {
    for (const id of ['block', 'beehive', 'loaf', 'pond']) {
      const e = new LifeEngine(20, 20);
      placePattern(e, byId(id), 5, 5);
      const before = cellSet(e.liveCells());
      e.tick();
      expect(cellSet(e.liveCells()), id).toEqual(before);
    }
  });

  it('oscillators return to their initial state after their period', () => {
    const periods: [string, number][] = [
      ['blinker', 2], ['toad', 2], ['beacon', 2], ['pulsar', 3], ['pentadecathlon', 15],
    ];
    for (const [id, period] of periods) {
      const e = new LifeEngine(40, 40);
      placePattern(e, byId(id), 12, 12);
      const before = cellSet(e.liveCells());
      for (let i = 0; i < period; i++) e.tick();
      expect(cellSet(e.liveCells()), id).toEqual(before);
    }
  });

  it('the Gosper gun emits its first glider by generation 30', () => {
    const e = new LifeEngine(96, 96);
    placePattern(e, byId('gosperGun'), 5, 5);
    for (let i = 0; i < 30; i++) e.tick();
    // gun (36 cells) has period 30 and has released one 5-cell glider
    expect(e.population()).toBe(41);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/patterns.test.ts`
Expected: FAIL — cannot resolve `../src/engine/patterns`.

- [ ] **Step 3: Write the implementation**

`src/engine/patterns.ts`:

```ts
import type { Cell } from './life';
import { LifeEngine } from './life';

export type PatternCategory = 'drone' | 'pulse' | 'voyager' | 'fountain' | 'wildcard';

export interface Pattern {
  id: string;
  name: string;
  category: PatternCategory;
  cells: Cell[];
  width: number;
  height: number;
}

export function fromRows(rows: string[]): Cell[] {
  const cells: Cell[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '#') cells.push({ x, y });
    });
  });
  return cells;
}

function def(id: string, name: string, category: PatternCategory, rows: string[]): Pattern {
  return {
    id,
    name,
    category,
    cells: fromRows(rows),
    width: Math.max(...rows.map(r => r.length)),
    height: rows.length,
  };
}

export const PATTERNS: Pattern[] = [
  def('block', 'Block', 'drone', ['##', '##']),
  def('beehive', 'Beehive', 'drone', ['.##.', '#..#', '.##.']),
  def('loaf', 'Loaf', 'drone', ['.##.', '#..#', '.#.#', '..#.']),
  def('pond', 'Pond', 'drone', ['.##.', '#..#', '#..#', '.##.']),
  def('blinker', 'Blinker', 'pulse', ['###']),
  def('toad', 'Toad', 'pulse', ['.###', '###.']),
  def('beacon', 'Beacon', 'pulse', ['##..', '##..', '..##', '..##']),
  def('pulsar', 'Pulsar', 'pulse', [
    '..###...###..',
    '.............',
    '#....#.#....#',
    '#....#.#....#',
    '#....#.#....#',
    '..###...###..',
    '.............',
    '..###...###..',
    '#....#.#....#',
    '#....#.#....#',
    '#....#.#....#',
    '.............',
    '..###...###..',
  ]),
  def('pentadecathlon', 'Pentadecathlon', 'pulse', [
    '..#....#..',
    '##.####.##',
    '..#....#..',
  ]),
  def('glider', 'Glider', 'voyager', ['.#.', '..#', '###']),
  def('lwss', 'Lightweight Spaceship', 'voyager', [
    '#..#.',
    '....#',
    '#...#',
    '.####',
  ]),
  def('gosperGun', 'Gosper Glider Gun', 'fountain', [
    '........................#...........',
    '......................#.#...........',
    '............##......##............##',
    '...........#...#....##............##',
    '##........#.....#...##..............',
    '##........#...#.##....#.#...........',
    '..........#.....#.......#...........',
    '...........#...#....................',
    '............##......................',
  ]),
  def('rPentomino', 'R-Pentomino', 'wildcard', ['.##', '##.', '.#.']),
  def('acorn', 'Acorn', 'wildcard', ['.#.....', '...#...', '##..###']),
];

export function rotateCells(cells: Cell[], quarterTurns: number): Cell[] {
  let out = cells.map(c => ({ ...c }));
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let t = 0; t < turns; t++) {
    const maxY = Math.max(...out.map(c => c.y));
    out = out.map(c => ({ x: maxY - c.y, y: c.x }));
  }
  return out;
}

export function placePattern(
  engine: LifeEngine,
  pattern: Pattern,
  ox: number,
  oy: number,
  quarterTurns = 0,
): void {
  for (const c of rotateCells(pattern.cells, quarterTurns)) {
    engine.set(ox + c.x, oy + c.y, true);
  }
}
```

Note: the Gosper gun rows are exactly 36 characters wide. If the generation-30 population test fails, diff the rows character-by-character against the canonical gun before touching engine code — the engine is already verified by Task 2.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/patterns.test.ts`
Expected: PASS (8 tests).

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/patterns.ts tests/patterns.test.ts
git commit -m "feat: curated pattern library with rotation and placement"
```

---

### Task 4: Geometry helpers + cluster grouping

**Files:**
- Create: `src/geometry.ts`, `src/tracker/cluster.ts` (grouping half)
- Test: `tests/geometry.test.ts`, `tests/cluster-grouping.test.ts`

**Interfaces:**
- Consumes: `Cell` from `src/engine/life.ts`.
- Produces:
  - `src/geometry.ts`: `function cellRadial(x: number, y: number, width: number, height: number): number` (0 at grid center, 1 at corners, clamped) and `function panFromX(x: number, width: number): number` (-1 left edge, +1 right edge).
  - `src/tracker/cluster.ts`: `function groupCells(cells: Cell[]): Cell[][]` — partitions live cells into clusters, where two cells share a cluster iff a chain of cells connects them with Chebyshev distance ≤ 2 between links. Also exports `const cellKey = (x: number, y: number) => number` (unique per cell for grids narrower than 4090).

- [ ] **Step 1: Write the failing tests**

`tests/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cellRadial, panFromX } from '../src/geometry';

describe('geometry', () => {
  it('radial is 0 at center, 1 at corner', () => {
    expect(cellRadial(47.5, 47.5, 96, 96)).toBeCloseTo(0);
    expect(cellRadial(0, 0, 96, 96)).toBeCloseTo(1);
    expect(cellRadial(95, 95, 96, 96)).toBeCloseTo(1);
  });

  it('radial is clamped to at most 1', () => {
    expect(cellRadial(-10, -10, 96, 96)).toBe(1);
  });

  it('pan maps left edge to -1, center to 0, right edge to +1', () => {
    expect(panFromX(0, 96)).toBeCloseTo(-1);
    expect(panFromX(47.5, 96)).toBeCloseTo(0);
    expect(panFromX(95, 96)).toBeCloseTo(1);
  });
});
```

`tests/cluster-grouping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupCells } from '../src/tracker/cluster';

const c = (x: number, y: number) => ({ x, y });

describe('groupCells', () => {
  it('returns no groups for an empty board', () => {
    expect(groupCells([])).toEqual([]);
  });

  it('groups adjacent cells together', () => {
    const groups = groupCells([c(5, 5), c(6, 5), c(5, 6), c(6, 6)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(4);
  });

  it('allows a one-cell gap (Chebyshev distance 2)', () => {
    expect(groupCells([c(0, 0), c(2, 2)])).toHaveLength(1);
  });

  it('separates cells at Chebyshev distance 3', () => {
    expect(groupCells([c(0, 0), c(3, 3)])).toHaveLength(2);
  });

  it('separates two distant blocks', () => {
    const groups = groupCells([
      c(2, 2), c(3, 2), c(2, 3), c(3, 3),
      c(20, 20), c(21, 20), c(20, 21), c(21, 21),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.length)).toEqual([4, 4]);
  });

  it('chains gaps: A-2-B-2-C is one cluster', () => {
    expect(groupCells([c(0, 0), c(2, 0), c(4, 0)])).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/geometry.test.ts tests/cluster-grouping.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`src/geometry.ts`:

```ts
export function cellRadial(x: number, y: number, width: number, height: number): number {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxDist = Math.hypot(cx, cy);
  return Math.min(1, Math.hypot(x - cx, y - cy) / maxDist);
}

export function panFromX(x: number, width: number): number {
  return (x / (width - 1)) * 2 - 1;
}
```

`src/tracker/cluster.ts`:

```ts
import type { Cell } from '../engine/life';

// Unique per cell for grids narrower than 4090 columns.
export const cellKey = (x: number, y: number): number => y * 4096 + x;

class UnionFind {
  private parent: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

// Forward half of the 5x5 Chebyshev-distance-2 neighborhood.
const OFFSETS: [number, number][] = [];
for (let dy = 0; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    if (dy > 0 || dx > 0) OFFSETS.push([dx, dy]);
  }
}

export function groupCells(cells: Cell[]): Cell[][] {
  const index = new Map<number, number>();
  cells.forEach((c, i) => index.set(cellKey(c.x, c.y), i));
  const uf = new UnionFind(cells.length);
  for (let i = 0; i < cells.length; i++) {
    for (const [dx, dy] of OFFSETS) {
      const j = index.get(cellKey(cells[i].x + dx, cells[i].y + dy));
      if (j !== undefined) uf.union(i, j);
    }
  }
  const groups = new Map<number, Cell[]>();
  for (let i = 0; i < cells.length; i++) {
    const root = uf.find(i);
    let g = groups.get(root);
    if (!g) {
      g = [];
      groups.set(root, g);
    }
    g.push(cells[i]);
  }
  return [...groups.values()];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/geometry.test.ts tests/cluster-grouping.test.ts`
Expected: PASS (9 tests).

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/geometry.ts src/tracker/cluster.ts tests/geometry.test.ts tests/cluster-grouping.test.ts
git commit -m "feat: radial/pan geometry and union-find cluster grouping"
```

---

### Task 5: ClusterTracker — identity, metrics, events

**Files:**
- Modify: `src/tracker/cluster.ts` (append tracker below grouping code)
- Test: `tests/cluster-tracker.test.ts`

**Interfaces:**
- Consumes: `groupCells`, `cellKey` (same file); `cellRadial`, `panFromX` from `src/geometry.ts`; `Cell` from `src/engine/life.ts`.
- Produces (all exported from `src/tracker/cluster.ts`):

```ts
interface ClusterMetrics {
  id: number;
  cells: Cell[];
  cellCount: number;
  centroid: { x: number; y: number };
  radial: number;    // 0..1 distance of centroid from grid center
  pan: number;       // -1..1 from centroid x
  aspect: number;    // bounding box width / height
  delta: number;     // cellCount change vs previous tick (0 for new clusters)
  velocity: number;  // centroid distance moved vs previous tick (0 for new)
}
interface ClusterEvents { born: ClusterMetrics[]; updated: ClusterMetrics[]; died: number[] }
class ClusterTracker {
  constructor(width: number, height: number);
  update(liveCells: Cell[]): ClusterEvents;
}
```

- Identity rules (from spec): match by cell overlap (largest overlap wins); fallback to nearest previous centroid within distance 3 for unclaimed groups; on split the largest fragment keeps the id; previous ids matched by no group are reported in `died`. Ties break toward the lower previous id.

- [ ] **Step 1: Write the failing test**

`tests/cluster-tracker.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ClusterTracker } from '../src/tracker/cluster';

const cells = (list: [number, number][]) => list.map(([x, y]) => ({ x, y }));

const BLINKER_H: [number, number][] = [[10, 10], [11, 10], [12, 10]];
const BLINKER_V: [number, number][] = [[11, 9], [11, 10], [11, 11]];

describe('ClusterTracker', () => {
  it('reports a new cluster as born with metrics', () => {
    const t = new ClusterTracker(96, 96);
    const ev = t.update(cells(BLINKER_H));
    expect(ev.born).toHaveLength(1);
    expect(ev.updated).toHaveLength(0);
    expect(ev.died).toHaveLength(0);
    const m = ev.born[0];
    expect(m.cellCount).toBe(3);
    expect(m.centroid).toEqual({ x: 11, y: 10 });
    expect(m.aspect).toBe(3);
    expect(m.delta).toBe(0);
    expect(m.velocity).toBe(0);
  });

  it('keeps a blinker as the same cluster across phases', () => {
    const t = new ClusterTracker(96, 96);
    const id = t.update(cells(BLINKER_H)).born[0].id;
    const ev = t.update(cells(BLINKER_V));
    expect(ev.born).toHaveLength(0);
    expect(ev.died).toHaveLength(0);
    expect(ev.updated).toHaveLength(1);
    const m = ev.updated[0];
    expect(m.id).toBe(id);
    expect(m.delta).toBe(0);          // 3 cells in both phases
    expect(m.velocity).toBe(0);       // centroid unchanged
    expect(m.aspect).toBeCloseTo(1 / 3); // vertical now
  });

  it('tracks two separate clusters independently', () => {
    const t = new ClusterTracker(96, 96);
    const ev = t.update(cells([[2, 2], [3, 2], [2, 3], [3, 3], [40, 40], [41, 40], [40, 41], [41, 41]]));
    expect(ev.born).toHaveLength(2);
    const ids = ev.born.map(m => m.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('reports death when a cluster disappears', () => {
    const t = new ClusterTracker(96, 96);
    const id = t.update(cells(BLINKER_H)).born[0].id;
    const ev = t.update([]);
    expect(ev.died).toEqual([id]);
    expect(ev.born).toHaveLength(0);
    expect(ev.updated).toHaveLength(0);
  });

  it('merge: the cluster with larger overlap keeps its id, the other dies', () => {
    const t = new ClusterTracker(96, 96);
    const small: [number, number][] = [[10, 10], [11, 10], [10, 11], [11, 11]]; // 4 cells
    const big: [number, number][] = [[20, 10], [21, 10], [22, 10], [20, 11], [21, 11], [22, 11]]; // 6 cells
    const ev1 = t.update(cells([...small, ...big]));
    expect(ev1.born).toHaveLength(2);
    const bigId = ev1.born.find(m => m.cellCount === 6)!.id;
    const smallId = ev1.born.find(m => m.cellCount === 4)!.id;
    // bridge them into one group (all previous cells still present)
    const bridged: [number, number][] = [...small, ...big, [13, 10], [15, 10], [17, 10], [18, 10]];
    const ev2 = t.update(cells(bridged));
    expect(ev2.updated).toHaveLength(1);
    expect(ev2.updated[0].id).toBe(bigId);
    expect(ev2.died).toEqual([smallId]);
  });

  it('split: the largest fragment keeps the id, others are born', () => {
    const t = new ClusterTracker(96, 96);
    const frag4: [number, number][] = [[10, 10], [11, 10], [10, 11], [11, 11]];
    const frag6: [number, number][] = [[16, 10], [17, 10], [18, 10], [16, 11], [17, 11], [18, 11]];
    const bridge: [number, number][] = [[13, 10], [14, 10]];
    const ev1 = t.update(cells([...frag4, ...bridge, ...frag6]));
    expect(ev1.born).toHaveLength(1);
    const id = ev1.born[0].id;
    const ev2 = t.update(cells([...frag4, ...frag6])); // bridge gone -> two clusters
    expect(ev2.updated).toHaveLength(1);
    expect(ev2.updated[0].id).toBe(id);
    expect(ev2.updated[0].cellCount).toBe(6);
    expect(ev2.born).toHaveLength(1);
    expect(ev2.born[0].cellCount).toBe(4);
    expect(ev2.died).toHaveLength(0);
  });

  it('tracks a mover via velocity', () => {
    const t = new ClusterTracker(96, 96);
    const id = t.update(cells([[10, 10], [11, 10], [12, 10]])).born[0].id;
    const ev = t.update(cells([[11, 10], [12, 10], [13, 10]])); // shifted right by 1
    expect(ev.updated[0].id).toBe(id);
    expect(ev.updated[0].velocity).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cluster-tracker.test.ts`
Expected: FAIL — `ClusterTracker` is not exported.

- [ ] **Step 3: Write the implementation**

Add this import at the **top** of `src/tracker/cluster.ts` (next to the existing `Cell` import):

```ts
import { cellRadial, panFromX } from '../geometry';
```

Then append the rest at the end of the file:

```ts
export interface ClusterMetrics {
  id: number;
  cells: Cell[];
  cellCount: number;
  centroid: { x: number; y: number };
  radial: number;
  pan: number;
  aspect: number;
  delta: number;
  velocity: number;
}

export interface ClusterEvents {
  born: ClusterMetrics[];
  updated: ClusterMetrics[];
  died: number[];
}

interface PrevCluster {
  keys: Set<number>;
  cellCount: number;
  centroid: { x: number; y: number };
}

function centroidOf(cells: Cell[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / cells.length, y: sy / cells.length };
}

export class ClusterTracker {
  private nextId = 1;
  private prev = new Map<number, PrevCluster>();

  constructor(
    private width: number,
    private height: number,
  ) {}

  update(liveCells: Cell[]): ClusterEvents {
    const groups = groupCells(liveCells).map(cells => ({
      cells,
      keys: new Set(cells.map(c => cellKey(c.x, c.y))),
      centroid: centroidOf(cells),
      claim: null as number | null,
    }));

    // 1. Claim by largest cell overlap (ties toward lower prev id).
    for (const g of groups) {
      let best: { id: number; overlap: number } | null = null;
      for (const [id, p] of this.prev) {
        let overlap = 0;
        for (const k of g.keys) if (p.keys.has(k)) overlap++;
        if (overlap > 0 && (!best || overlap > best.overlap)) best = { id, overlap };
      }
      g.claim = best?.id ?? null;
    }

    // 2. Fallback: unclaimed group adopts nearest unclaimed prev centroid within 3.
    for (const g of groups) {
      if (g.claim !== null) continue;
      let best: { id: number; d: number } | null = null;
      for (const [id, p] of this.prev) {
        if (groups.some(o => o.claim === id)) continue;
        const d = Math.hypot(g.centroid.x - p.centroid.x, g.centroid.y - p.centroid.y);
        if (d <= 3 && (!best || d < best.d)) best = { id, d };
      }
      if (best) g.claim = best.id;
    }

    // 3. Splits: several groups claiming one prev id -> largest keeps it.
    const byClaim = new Map<number, typeof groups>();
    for (const g of groups) {
      if (g.claim === null) continue;
      let list = byClaim.get(g.claim);
      if (!list) {
        list = [];
        byClaim.set(g.claim, list);
      }
      list.push(g);
    }
    for (const [, claimants] of byClaim) {
      if (claimants.length < 2) continue;
      claimants.sort((a, b) => b.cells.length - a.cells.length);
      for (const loser of claimants.slice(1)) loser.claim = null;
    }

    // 4. Build events.
    const born: ClusterMetrics[] = [];
    const updated: ClusterMetrics[] = [];
    const claimedIds = new Set<number>();
    const nextPrev = new Map<number, PrevCluster>();

    for (const g of groups) {
      const isNew = g.claim === null;
      const id = isNew ? this.nextId++ : g.claim!;
      if (!isNew) claimedIds.add(id);
      const prev = isNew ? undefined : this.prev.get(id);
      const m = this.metricsFor(id, g.cells, g.centroid, prev);
      (isNew ? born : updated).push(m);
      nextPrev.set(id, { keys: g.keys, cellCount: g.cells.length, centroid: g.centroid });
    }

    const died = [...this.prev.keys()].filter(id => !claimedIds.has(id));
    this.prev = nextPrev;
    return { born, updated, died };
  }

  private metricsFor(
    id: number,
    cells: Cell[],
    centroid: { x: number; y: number },
    prev: PrevCluster | undefined,
  ): ClusterMetrics {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of cells) {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    }
    return {
      id,
      cells,
      cellCount: cells.length,
      centroid,
      radial: cellRadial(centroid.x, centroid.y, this.width, this.height),
      pan: panFromX(centroid.x, this.width),
      aspect: (maxX - minX + 1) / (maxY - minY + 1),
      delta: prev ? cells.length - prev.cellCount : 0,
      velocity: prev
        ? Math.hypot(centroid.x - prev.centroid.x, centroid.y - prev.centroid.y)
        : 0,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cluster-tracker.test.ts`
Expected: PASS (7 tests). Also run `npx vitest run` — all previous suites still pass.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/tracker/cluster.ts tests/cluster-tracker.test.ts
git commit -m "feat: ClusterTracker with stable identities, merge/split handling, metrics"
```

---

### Task 6: Scale quantization

**Files:**
- Create: `src/audio/scale.ts`
- Test: `tests/scale.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const SCALES: Record<ScaleName, readonly number[]>` with keys `majorPentatonic, minorPentatonic, lydian, dorian, wholeTone, aeolian` (semitone offsets from root).
  - `type ScaleName` (the keys above), `const KEYS = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']`, `type KeyName`.
  - `function midiToFreq(midi: number): number`
  - `function quantize(radial: number, key: KeyName, scale: ScaleName, baseMidi?: number, octaves?: number): number` — maps radial 0..1 onto `octaves * scaleLength + 1` scale degrees starting at `baseMidi` (default 48) + key offset; returns frequency in Hz. Radial is clamped to [0, 1].

- [ ] **Step 1: Write the failing test**

`tests/scale.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SCALES, KEYS, midiToFreq, quantize } from '../src/audio/scale';

describe('scale quantization', () => {
  it('has 6 scales and 12 keys', () => {
    expect(Object.keys(SCALES)).toHaveLength(6);
    expect(KEYS).toHaveLength(12);
  });

  it('converts MIDI to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(48)).toBeCloseTo(130.81, 1);
  });

  it('radial 0 in C is the root (C3)', () => {
    expect(quantize(0, 'C', 'majorPentatonic')).toBeCloseTo(130.81, 1);
  });

  it('radial 1 in C is two octaves up (C5)', () => {
    expect(quantize(1, 'C', 'majorPentatonic')).toBeCloseTo(523.25, 1);
  });

  it('radial 0.5 in C major pentatonic is exactly one octave up (C4)', () => {
    // 11 degrees, index 5 = first degree of octave 2 = C4
    expect(quantize(0.5, 'C', 'majorPentatonic')).toBeCloseTo(261.63, 1);
  });

  it('respects the key: root of D is D3', () => {
    expect(quantize(0, 'D', 'majorPentatonic')).toBeCloseTo(146.83, 1);
  });

  it('all outputs land on scale tones', () => {
    const steps = SCALES.dorian;
    for (let r = 0; r <= 1.0001; r += 0.05) {
      const freq = quantize(r, 'C', 'dorian');
      const midi = Math.round(69 + 12 * Math.log2(freq / 440));
      expect(steps).toContain(((midi - 48) % 12 + 12) % 12);
    }
  });

  it('clamps radial outside 0..1', () => {
    expect(quantize(-0.5, 'C', 'majorPentatonic')).toBeCloseTo(quantize(0, 'C', 'majorPentatonic'));
    expect(quantize(1.5, 'C', 'majorPentatonic')).toBeCloseTo(quantize(1, 'C', 'majorPentatonic'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scale.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/audio/scale.ts`:

```ts
export const SCALES = {
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const;

export type ScaleName = keyof typeof SCALES;

export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export type KeyName = (typeof KEYS)[number];

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function quantize(
  radial: number,
  key: KeyName,
  scale: ScaleName,
  baseMidi = 48,
  octaves = 2,
): number {
  const steps = SCALES[scale];
  const degreeCount = steps.length * octaves + 1;
  const clamped = Math.max(0, Math.min(1, radial));
  const index = Math.round(clamped * (degreeCount - 1));
  const octave = Math.floor(index / steps.length);
  const midi = baseMidi + KEYS.indexOf(key) + octave * 12 + steps[index % steps.length];
  return midiToFreq(midi);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scale.test.ts`
Expected: PASS (8 tests).

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/audio/scale.ts tests/scale.test.ts
git commit -m "feat: key/scale quantization from radial distance"
```

---

### Task 7: Ping planning + voice allocation (pure audio logic)

**Files:**
- Create: `src/audio/allocation.ts`
- Test: `tests/allocation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface PingPlan { x: number; y: number; delayMs: number; velocity: number }`
  - `function planPings(births: {x:number;y:number}[], maxPings?: number, spreadMs?: number): PingPlan[]` — defaults maxPings=12, spreadMs=80. Spreads chosen pings evenly across [0, spreadMs]. When births exceed maxPings, samples evenly down to maxPings and boosts the first ping's velocity (0.5 vs the normal 0.25) to represent the overflow.
  - `function allocateVoices(clusters: { id: number; cellCount: number }[], maxVoices?: number): Set<number>` — default maxVoices=16; returns ids of the largest clusters; does not mutate its input.

- [ ] **Step 1: Write the failing test**

`tests/allocation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planPings, allocateVoices } from '../src/audio/allocation';

const births = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }));

describe('planPings', () => {
  it('returns nothing for no births', () => {
    expect(planPings([])).toEqual([]);
  });

  it('gives a single birth zero delay', () => {
    const plans = planPings(births(1));
    expect(plans).toHaveLength(1);
    expect(plans[0].delayMs).toBe(0);
  });

  it('staggers births across the spread window', () => {
    const plans = planPings(births(5));
    expect(plans).toHaveLength(5);
    expect(plans[0].delayMs).toBe(0);
    expect(plans[4].delayMs).toBe(80);
    expect(plans[2].delayMs).toBeCloseTo(40);
  });

  it('caps at 12 pings and boosts the first when overflowing', () => {
    const plans = planPings(births(40));
    expect(plans).toHaveLength(12);
    expect(plans[0].velocity).toBe(0.5);
    expect(plans[1].velocity).toBe(0.25);
  });

  it('uses normal velocity without overflow', () => {
    expect(planPings(births(12)).every(p => p.velocity === 0.25)).toBe(true);
  });
});

describe('allocateVoices', () => {
  it('keeps everything under the cap', () => {
    const set = allocateVoices([{ id: 1, cellCount: 3 }, { id: 2, cellCount: 5 }]);
    expect(set).toEqual(new Set([1, 2]));
  });

  it('keeps only the largest clusters over the cap', () => {
    const clusters = Array.from({ length: 20 }, (_, i) => ({ id: i, cellCount: i + 1 }));
    const set = allocateVoices(clusters, 16);
    expect(set.size).toBe(16);
    expect(set.has(19)).toBe(true); // biggest kept
    expect(set.has(3)).toBe(false); // smallest 4 dropped
  });

  it('does not mutate the input order', () => {
    const clusters = [{ id: 1, cellCount: 1 }, { id: 2, cellCount: 9 }];
    allocateVoices(clusters, 1);
    expect(clusters[0].id).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/allocation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/audio/allocation.ts`:

```ts
export interface PingPlan {
  x: number;
  y: number;
  delayMs: number;
  velocity: number;
}

export function planPings(
  births: { x: number; y: number }[],
  maxPings = 12,
  spreadMs = 80,
): PingPlan[] {
  if (births.length === 0) return [];
  const overflow = births.length > maxPings;
  let chosen = births;
  if (overflow) {
    const stride = births.length / maxPings;
    chosen = Array.from({ length: maxPings }, (_, i) => births[Math.floor(i * stride)]);
  }
  const n = chosen.length;
  return chosen.map((b, i) => ({
    x: b.x,
    y: b.y,
    delayMs: n === 1 ? 0 : (i / (n - 1)) * spreadMs,
    velocity: overflow && i === 0 ? 0.5 : 0.25,
  }));
}

export function allocateVoices(
  clusters: { id: number; cellCount: number }[],
  maxVoices = 16,
): Set<number> {
  return new Set(
    [...clusters]
      .sort((a, b) => b.cellCount - a.cellCount)
      .slice(0, maxVoices)
      .map(c => c.id),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/allocation.test.ts`
Expected: PASS (8 tests).

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/audio/allocation.ts tests/allocation.test.ts
git commit -m "feat: ping stagger/cap planning and pad voice allocation"
```

---

### Task 8: SoundMapper (Tone.js)

**Files:**
- Create: `src/audio/soundMapper.ts`

**Interfaces:**
- Consumes: `ClusterEvents`, `ClusterMetrics` from `src/tracker/cluster.ts`; `quantize`, `midiToFreq`, `KEYS`, `KeyName`, `ScaleName` from `src/audio/scale.ts`; `cellRadial` from `src/geometry.ts`; `planPings`, `allocateVoices` from `src/audio/allocation.ts`; `Cell` from `src/engine/life.ts`; `tone` package.
- Produces:

```ts
class SoundMapper {
  key: KeyName;      // default 'C'
  scale: ScaleName;  // default 'majorPentatonic'
  init(): Promise<void>;              // build audio graph; call after Tone.start()
  setKeyScale(key: KeyName, scale: ScaleName): void;
  setMasterVolume(db: number): void;
  handleTick(events: ClusterEvents, births: Cell[], population: number, tickSec: number, gridW: number, gridH: number): void;
}
```

- No unit tests: this module is all Tone.js side effects (spec: manual smoke test). Verification for this task = `npm run typecheck` + `npm run build` clean. TDD is intentionally waived here per the spec's testing section.

- [ ] **Step 1: Write the implementation**

`src/audio/soundMapper.ts`:

```ts
import * as Tone from 'tone';
import type { Cell } from '../engine/life';
import type { ClusterEvents, ClusterMetrics } from '../tracker/cluster';
import { cellRadial } from '../geometry';
import { KEYS, midiToFreq, quantize, type KeyName, type ScaleName } from './scale';
import { allocateVoices, planPings } from './allocation';

const PAD_BASE_MIDI = 48; // C3
const PING_BASE_MIDI = 72; // C5, two octaves above the pad register
const MAX_PADS = 16;

class PadVoice {
  private gain = new Tone.Gain(0);
  private panner = new Tone.Panner(0);
  private filter = new Tone.Filter(800, 'lowpass');
  private oscA = new Tone.Oscillator(220, 'sawtooth');
  private oscB = new Tone.Oscillator(220, 'triangle');
  private vibrato = new Tone.LFO(4, -12, 12); // cents into oscA.detune

  constructor(out: Tone.ToneAudioNode) {
    this.oscA.connect(this.filter);
    this.oscB.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.connect(out);
    this.vibrato.connect(this.oscA.detune);
    this.vibrato.amplitude.value = 0;
    this.oscA.start();
    this.oscB.start();
    this.vibrato.start();
  }

  apply(m: ClusterMetrics, freq: number, rampSec: number): void {
    this.oscA.frequency.rampTo(freq, 0.2);
    const detuneCents = 3 + Math.min(12, m.cellCount * 0.4);
    this.oscB.frequency.rampTo(freq * Math.pow(2, detuneCents / 1200), 0.2);

    const vol = Math.min(0.22, 0.04 + Math.log2(1 + m.cellCount) * 0.03);
    const warble = Math.min(0.6, Math.abs(m.delta) * 0.1);
    this.gain.gain.rampTo(vol * (1 - 0.4 * warble), rampSec);

    const aspectNorm = Math.min(4, Math.max(0.25, m.aspect));
    this.filter.frequency.rampTo(350 + aspectNorm * 450 + warble * 900, rampSec);

    this.panner.pan.rampTo(Math.max(-1, Math.min(1, m.pan)), 0.5);
    this.vibrato.amplitude.rampTo(Math.min(1, m.velocity / 1.5), 0.5);
  }

  mute(): void {
    this.gain.gain.rampTo(0, 1);
  }

  release(): void {
    this.gain.gain.cancelScheduledValues(Tone.now());
    this.gain.gain.rampTo(0, 4);
    setTimeout(() => this.dispose(), 4500);
  }

  private dispose(): void {
    for (const node of [this.oscA, this.oscB, this.vibrato, this.filter, this.gain, this.panner]) {
      node.dispose();
    }
  }
}

export class SoundMapper {
  key: KeyName = 'C';
  scale: ScaleName = 'majorPentatonic';

  private busIn!: Tone.Filter;
  private reverb!: Tone.Reverb;
  private duckGain!: Tone.Gain;
  private limiter!: Tone.Limiter;
  private pingSynth!: Tone.PolySynth;
  private anchorRoot!: Tone.Oscillator;
  private anchorFifth!: Tone.Oscillator;
  private anchorGain!: Tone.Gain;
  private pads = new Map<number, PadVoice>();
  private ready = false;

  async init(): Promise<void> {
    this.limiter = new Tone.Limiter(-3).toDestination();
    this.duckGain = new Tone.Gain(1).connect(this.limiter);
    this.reverb = new Tone.Reverb({ decay: 8, wet: 0.55 }).connect(this.duckGain);
    this.busIn = new Tone.Filter(4500, 'lowpass').connect(this.reverb);
    await this.reverb.ready;

    this.pingSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 5.1,
      modulationIndex: 8,
      envelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.3 },
      modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
      volume: -18,
    }).connect(this.busIn);

    this.anchorGain = new Tone.Gain(0).connect(this.busIn);
    this.anchorRoot = new Tone.Oscillator(midiToFreq(36), 'sine').connect(this.anchorGain).start();
    this.anchorFifth = new Tone.Oscillator(midiToFreq(43), 'triangle')
      .connect(this.anchorGain)
      .start();
    this.ready = true;
  }

  setKeyScale(key: KeyName, scale: ScaleName): void {
    this.key = key;
    this.scale = scale;
    if (!this.ready) return;
    const root = 36 + KEYS.indexOf(key);
    this.anchorRoot.frequency.rampTo(midiToFreq(root), 1);
    this.anchorFifth.frequency.rampTo(midiToFreq(root + 7), 1);
    // sounding pads glide to requantized pitches on their next handleTick
  }

  setMasterVolume(db: number): void {
    Tone.getDestination().volume.rampTo(db, 0.1);
  }

  handleTick(
    events: ClusterEvents,
    births: Cell[],
    population: number,
    tickSec: number,
    gridW: number,
    gridH: number,
  ): void {
    if (!this.ready) return;
    const now = Tone.now();

    // 1. Birth pings (staggered, capped).
    for (const p of planPings(births)) {
      const freq = quantize(cellRadial(p.x, p.y, gridW, gridH), this.key, this.scale, PING_BASE_MIDI, 2);
      this.pingSynth.triggerAttackRelease(freq, 0.15, now + p.delayMs / 1000, p.velocity);
    }

    // 2. Pads: release the dead, allocate voices to the largest, apply metrics.
    for (const id of events.died) {
      this.pads.get(id)?.release();
      this.pads.delete(id);
    }
    const active = [...events.born, ...events.updated];
    const audible = allocateVoices(
      active.map(m => ({ id: m.id, cellCount: m.cellCount })),
      MAX_PADS,
    );
    for (const m of active) {
      if (!audible.has(m.id)) {
        this.pads.get(m.id)?.mute();
        continue;
      }
      let voice = this.pads.get(m.id);
      const isNew = !voice;
      if (!voice) {
        // Lazily created, so clusters stamped while paused still get a pad.
        voice = new PadVoice(this.busIn);
        this.pads.set(m.id, voice);
      }
      const freq = quantize(m.radial, this.key, this.scale, PAD_BASE_MIDI, 2);
      voice.apply(m, freq, isNew ? 2 : Math.max(0.1, tickSec * 0.9));
    }

    // 3. Harmonic anchor: sounds whenever anything is alive.
    this.anchorGain.gain.rampTo(population > 0 ? 0.05 : 0, 2);

    // 4. Population ducking (limiter is the hard backstop).
    const duckDb = Math.min(12, population / 30);
    this.duckGain.gain.rampTo(Math.pow(10, -duckDb / 20), 1);
  }
}
```

- [ ] **Step 2: Verify it compiles and builds**

Run: `npm run typecheck`
Expected: clean. If Tone.js type names differ (e.g. `ToneAudioNode` import path), fix the annotation, not the structure.

Run: `npm run build`
Expected: succeeds.

Run: `npx vitest run`
Expected: all existing suites still pass.

- [ ] **Step 3: Commit**

```bash
git add src/audio/soundMapper.ts
git commit -m "feat: SoundMapper with pad voices, birth pings, anchor drone, ducked bus"
```

---

### Task 9: Canvas renderer

**Files:**
- Create: `src/ui/renderer.ts`
- Test: `tests/renderer.test.ts` (pure hue helper only)

**Interfaces:**
- Consumes: `Cell` from `src/engine/life.ts`; `ClusterMetrics` from `src/tracker/cluster.ts`.
- Produces:
  - `function clusterHue(id: number): number` — stable hue in [0, 360) via golden-angle spacing.
  - `class Renderer { constructor(canvas: HTMLCanvasElement, gridW: number, gridH: number); setClusters(clusters: ClusterMetrics[]): void; noteBirths(cells: Cell[], t: number): void; noteDeaths(cells: Cell[], t: number): void; setPreview(cells: Cell[] | null): void; draw(t: number): void }`
  - `draw(t)` renders: background, concentric pitch rings, death fades (900 ms), cluster cells in their hue, birth flashes (600 ms), preview ghost, and a "place a pattern" hint when the board is empty. `t` is a `performance.now()`-style timestamp supplied by the caller.

- [ ] **Step 1: Write the failing test**

`tests/renderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clusterHue } from '../src/ui/renderer';

describe('clusterHue', () => {
  it('is stable for a given id', () => {
    expect(clusterHue(7)).toBe(clusterHue(7));
  });

  it('stays within [0, 360)', () => {
    for (let id = 1; id < 100; id++) {
      expect(clusterHue(id)).toBeGreaterThanOrEqual(0);
      expect(clusterHue(id)).toBeLessThan(360);
    }
  });

  it('spreads consecutive ids apart', () => {
    const gap = Math.abs(clusterHue(1) - clusterHue(2));
    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/ui/renderer.ts`:

```ts
import type { Cell } from '../engine/life';
import type { ClusterMetrics } from '../tracker/cluster';

const FLASH_MS = 600;
const FADE_MS = 900;

export function clusterHue(id: number): number {
  return (id * 137.508) % 360;
}

interface Spark {
  x: number;
  y: number;
  t0: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cellPx: number;
  private clusters: ClusterMetrics[] = [];
  private flashes: Spark[] = [];
  private fades: Spark[] = [];
  private preview: Cell[] | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private gridW: number,
    private gridH: number,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.cellPx = Math.floor(Math.min(canvas.width / gridW, canvas.height / gridH));
  }

  setClusters(clusters: ClusterMetrics[]): void {
    this.clusters = clusters;
  }

  noteBirths(cells: Cell[], t: number): void {
    for (const c of cells) this.flashes.push({ x: c.x, y: c.y, t0: t });
  }

  noteDeaths(cells: Cell[], t: number): void {
    for (const c of cells) this.fades.push({ x: c.x, y: c.y, t0: t });
  }

  setPreview(cells: Cell[] | null): void {
    this.preview = cells;
  }

  draw(t: number): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.drawRings();

    this.fades = this.fades.filter(f => t - f.t0 < FADE_MS);
    for (const f of this.fades) {
      const a = 0.35 * (1 - (t - f.t0) / FADE_MS);
      ctx.fillStyle = `rgba(148, 163, 184, ${a})`;
      this.cellRect(f.x, f.y);
    }

    for (const cl of this.clusters) {
      ctx.fillStyle = `hsl(${clusterHue(cl.id)} 60% 62%)`;
      for (const c of cl.cells) this.cellRect(c.x, c.y);
    }

    this.flashes = this.flashes.filter(f => t - f.t0 < FLASH_MS);
    for (const f of this.flashes) {
      const a = 0.9 * (1 - (t - f.t0) / FLASH_MS);
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
      this.cellRect(f.x, f.y);
    }

    if (this.preview) {
      ctx.fillStyle = 'rgba(122, 162, 247, 0.45)';
      for (const c of this.preview) this.cellRect(c.x, c.y);
    }

    if (this.clusters.length === 0 && !this.preview) {
      ctx.fillStyle = 'rgba(200, 204, 212, 0.4)';
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('pick a pattern, then click to place it', canvas.width / 2, canvas.height / 2);
    }
  }

  private cellRect(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.gridW || y >= this.gridH) return;
    const p = this.cellPx;
    this.ctx.fillRect(x * p + 0.5, y * p + 0.5, p - 1, p - 1);
  }

  private drawRings(): void {
    const { ctx } = this;
    const cx = (this.gridW * this.cellPx) / 2;
    const cy = (this.gridH * this.cellPx) / 2;
    const maxR = Math.hypot(cx, cy);
    ctx.strokeStyle = 'rgba(122, 162, 247, 0.07)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 8; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (maxR * i) / 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer.test.ts`
Expected: PASS (3 tests).

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/renderer.ts tests/renderer.test.ts
git commit -m "feat: canvas renderer with cluster hues, birth/death animation, pitch rings"
```

---

### Task 10: Controls and pattern palette

**Files:**
- Create: `src/ui/controls.ts`

**Interfaces:**
- Consumes: `Pattern`, `PatternCategory`, `PATTERNS` from `src/engine/patterns.ts`; `KEYS`, `SCALES`, `KeyName`, `ScaleName` from `src/audio/scale.ts`.
- Produces:

```ts
type Tool = { kind: 'pattern'; pattern: Pattern } | { kind: 'paint' };
interface ControlCallbacks {
  onPlayToggle(): void;
  onRateChange(gensPerSec: number): void;
  onKeyChange(key: KeyName): void;
  onScaleChange(scale: ScaleName): void;
  onVolumeChange(db: number): void;
  onClear(): void;
  onToolChange(tool: Tool): void;
}
function buildControls(controlsRoot: HTMLElement, paletteRoot: HTMLElement, cb: ControlCallbacks): { setPlaying(playing: boolean): void }
```

- Palette groups by category with headings: Drones, Pulses, Voyagers, Fountains, Wildcards, plus a "Paint cells" tool button at top. Selected button gets class `selected`. Controls row: play/pause button, rate slider 1–8 (step 1, default 4), key select, scale select, volume slider -30..0 dB (default -6), clear button.
- No unit tests (thin DOM layer, verified in Task 11's smoke test). Verification = typecheck + build.

- [ ] **Step 1: Write the implementation**

`src/ui/controls.ts`:

```ts
import { PATTERNS, type Pattern, type PatternCategory } from '../engine/patterns';
import { KEYS, SCALES, type KeyName, type ScaleName } from '../audio/scale';

export type Tool = { kind: 'pattern'; pattern: Pattern } | { kind: 'paint' };

export interface ControlCallbacks {
  onPlayToggle(): void;
  onRateChange(gensPerSec: number): void;
  onKeyChange(key: KeyName): void;
  onScaleChange(scale: ScaleName): void;
  onVolumeChange(db: number): void;
  onClear(): void;
  onToolChange(tool: Tool): void;
}

const CATEGORY_LABELS: Record<PatternCategory, string> = {
  drone: 'Drones',
  pulse: 'Pulses',
  voyager: 'Voyagers',
  fountain: 'Fountains',
  wildcard: 'Wildcards',
};

const SCALE_LABELS: Record<ScaleName, string> = {
  majorPentatonic: 'Major pentatonic',
  minorPentatonic: 'Minor pentatonic',
  lydian: 'Lydian',
  dorian: 'Dorian',
  wholeTone: 'Whole tone',
  aeolian: 'Aeolian',
};

export function buildControls(
  controlsRoot: HTMLElement,
  paletteRoot: HTMLElement,
  cb: ControlCallbacks,
): { setPlaying(playing: boolean): void } {
  // --- palette ---
  const buttons: HTMLButtonElement[] = [];
  const select = (btn: HTMLButtonElement, tool: Tool) => {
    for (const b of buttons) b.classList.remove('selected');
    btn.classList.add('selected');
    cb.onToolChange(tool);
  };

  const paintBtn = document.createElement('button');
  paintBtn.textContent = 'Paint cells';
  paintBtn.addEventListener('click', () => select(paintBtn, { kind: 'paint' }));
  paletteRoot.appendChild(paintBtn);
  buttons.push(paintBtn);

  for (const category of Object.keys(CATEGORY_LABELS) as PatternCategory[]) {
    const heading = document.createElement('h3');
    heading.textContent = CATEGORY_LABELS[category];
    paletteRoot.appendChild(heading);
    for (const pattern of PATTERNS.filter(p => p.category === category)) {
      const btn = document.createElement('button');
      btn.textContent = pattern.name;
      btn.addEventListener('click', () => select(btn, { kind: 'pattern', pattern }));
      paletteRoot.appendChild(btn);
      buttons.push(btn);
    }
  }

  // --- controls row ---
  const playBtn = document.createElement('button');
  playBtn.textContent = 'Pause';
  playBtn.addEventListener('click', () => cb.onPlayToggle());
  controlsRoot.appendChild(playBtn);

  const rate = document.createElement('input');
  rate.type = 'range';
  rate.min = '1';
  rate.max = '8';
  rate.step = '1';
  rate.value = '4';
  rate.addEventListener('input', () => cb.onRateChange(Number(rate.value)));
  controlsRoot.appendChild(labeled('speed', rate));

  const keySelect = document.createElement('select');
  for (const k of KEYS) keySelect.appendChild(new Option(k, k));
  keySelect.addEventListener('change', () => cb.onKeyChange(keySelect.value as KeyName));
  controlsRoot.appendChild(labeled('key', keySelect));

  const scaleSelect = document.createElement('select');
  for (const s of Object.keys(SCALES) as ScaleName[]) {
    scaleSelect.appendChild(new Option(SCALE_LABELS[s], s));
  }
  scaleSelect.addEventListener('change', () => cb.onScaleChange(scaleSelect.value as ScaleName));
  controlsRoot.appendChild(labeled('scale', scaleSelect));

  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '-30';
  volume.max = '0';
  volume.step = '1';
  volume.value = '-6';
  volume.addEventListener('input', () => cb.onVolumeChange(Number(volume.value)));
  controlsRoot.appendChild(labeled('volume', volume));

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => cb.onClear());
  controlsRoot.appendChild(clearBtn);

  const hint = document.createElement('span');
  hint.textContent = 'R rotates the armed pattern';
  hint.style.color = '#6b7280';
  controlsRoot.appendChild(hint);

  return {
    setPlaying(playing: boolean) {
      playBtn.textContent = playing ? 'Pause' : 'Play';
    },
  };
}

function labeled(text: string, el: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.append(text, el);
  return label;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: clean.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/ui/controls.ts
git commit -m "feat: control bar and categorized pattern palette"
```

---

### Task 11: Main wiring — transport, gate, interaction

**Files:**
- Modify: `src/main.ts` (replace placeholder entirely)

**Interfaces:**
- Consumes: everything produced by Tasks 2–10.
- Produces: the working app. Behavior contract:
  - First click on `#start-btn`: `await Tone.start()`, `await mapper.init()`, hide `#gate`, start Transport, begin ticking at the current rate.
  - Tick pipeline: `engine.tick()` → `tracker.update(engine.liveCells())` → `mapper.handleTick(...)` → renderer state updates. Rendering runs on its own `requestAnimationFrame` loop.
  - Pattern tool: ghost preview follows cursor; `r`/`R` rotates; click stamps (works running or paused). Paint tool: click toggles a single cell.
  - Stamping or painting while paused updates tracker + renderer but NOT the mapper (arranging is silent; sound starts on play — the mapper creates missing pads lazily).
  - Clear: engine cleared, then one tracker update flows through the mapper so pads release.
  - If the AudioContext is suspended by the browser later (tab switch), any click on the page resumes it.

- [ ] **Step 1: Write the implementation**

`src/main.ts`:

```ts
import * as Tone from 'tone';
import { LifeEngine } from './engine/life';
import { placePattern, rotateCells, type Pattern } from './engine/patterns';
import { ClusterTracker } from './tracker/cluster';
import { SoundMapper } from './audio/soundMapper';
import { Renderer } from './ui/renderer';
import { buildControls, type Tool } from './ui/controls';

const GRID = 96;

const canvas = document.querySelector<HTMLCanvasElement>('#board');
const controlsRoot = document.querySelector<HTMLElement>('#controls');
const paletteRoot = document.querySelector<HTMLElement>('#palette');
const gate = document.querySelector<HTMLElement>('#gate');
const startBtn = document.querySelector<HTMLButtonElement>('#start-btn');
if (!canvas || !controlsRoot || !paletteRoot || !gate || !startBtn) {
  throw new Error('missing root elements');
}

const engine = new LifeEngine(GRID, GRID);
const tracker = new ClusterTracker(GRID, GRID);
const mapper = new SoundMapper();
const renderer = new Renderer(canvas, GRID, GRID);

let playing = true;
let rate = 4; // generations per second
let tool: Tool = { kind: 'paint' };
let rotation = 0;
let cursor: { x: number; y: number } | null = null;
let repeatId: number | null = null;

function tick(): void {
  const { births, deaths } = engine.tick();
  const events = tracker.update(engine.liveCells());
  mapper.handleTick(events, births, engine.population(), 1 / rate, GRID, GRID);
  const t = performance.now();
  renderer.noteBirths(births, t);
  renderer.noteDeaths(deaths, t);
  renderer.setClusters([...events.born, ...events.updated]);
}

function scheduleLoop(): void {
  const transport = Tone.getTransport();
  if (repeatId !== null) transport.clear(repeatId);
  repeatId = transport.scheduleRepeat(() => tick(), 1 / rate);
}

// Refresh visuals after board edits. While paused the mapper stays silent
// (arranging); the next audible tick creates any missing pads lazily.
function refresh(silent: boolean): void {
  const events = tracker.update(engine.liveCells());
  if (!silent) {
    mapper.handleTick(events, [], engine.population(), 1 / rate, GRID, GRID);
  }
  renderer.setClusters([...events.born, ...events.updated]);
}

const ui = buildControls(controlsRoot, paletteRoot, {
  onPlayToggle() {
    playing = !playing;
    const transport = Tone.getTransport();
    if (playing) transport.start();
    else transport.pause();
    ui.setPlaying(playing);
  },
  onRateChange(gps) {
    rate = gps;
    scheduleLoop();
  },
  onKeyChange(key) {
    mapper.setKeyScale(key, mapper.scale);
  },
  onScaleChange(scale) {
    mapper.setKeyScale(mapper.key, scale);
  },
  onVolumeChange(db) {
    mapper.setMasterVolume(db);
  },
  onClear() {
    engine.clear();
    refresh(false); // audible: releases all pads
  },
  onToolChange(t) {
    tool = t;
    rotation = 0;
    updatePreview();
  },
});

// --- pointer interaction ---

function cellAt(ev: MouseEvent): { x: number; y: number } {
  const rect = canvas!.getBoundingClientRect();
  const px = ((ev.clientX - rect.left) / rect.width) * GRID;
  const py = ((ev.clientY - rect.top) / rect.height) * GRID;
  return { x: Math.floor(px), y: Math.floor(py) };
}

function updatePreview(): void {
  if (cursor && tool.kind === 'pattern') {
    const cells = rotateCells(tool.pattern.cells, rotation).map(c => ({
      x: c.x + cursor!.x,
      y: c.y + cursor!.y,
    }));
    renderer.setPreview(cells);
  } else {
    renderer.setPreview(null);
  }
}

canvas.addEventListener('mousemove', ev => {
  cursor = cellAt(ev);
  updatePreview();
});

canvas.addEventListener('mouseleave', () => {
  cursor = null;
  renderer.setPreview(null);
});

canvas.addEventListener('click', ev => {
  const { x, y } = cellAt(ev);
  if (tool.kind === 'pattern') {
    placePattern(engine, tool.pattern, x, y, rotation);
  } else {
    engine.set(x, y, !engine.get(x, y));
  }
  refresh(!playing);
});

window.addEventListener('keydown', ev => {
  if (ev.key === 'r' || ev.key === 'R') {
    rotation = (rotation + 1) % 4;
    updatePreview();
  }
});

// --- render loop ---

function raf(t: number): void {
  renderer.draw(t);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// --- audio gate ---

startBtn.addEventListener('click', () => {
  void (async () => {
    await Tone.start();
    await mapper.init();
    gate!.classList.add('hidden');
    scheduleLoop();
    Tone.getTransport().start();
    ui.setPlaying(true);
  })();
});

// Resume a suspended context on any later interaction (tab switches etc.).
document.addEventListener('click', () => {
  if (Tone.getContext().state !== 'running') void Tone.start();
});
```

- [ ] **Step 2: Verify it compiles and builds**

Run: `npm run typecheck`
Expected: clean.

Run: `npm run build`
Expected: succeeds.

Run: `npx vitest run`
Expected: all suites pass.

- [ ] **Step 3: Manual smoke check (quick)**

Run: `npm run dev` and open the printed URL in a browser.
Expected minimum: gate appears; after clicking start, the board shows the empty-board hint; selecting Blinker and clicking places it; it oscillates and you hear a pad; clicking Clear fades sound out. (Full checklist comes in Task 12.)

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire engine, tracker, mapper, renderer and controls into the app"
```

---

### Task 12: README and smoke-test checklist

**Files:**
- Create: `README.md`, `docs/smoke-test.md`

**Interfaces:**
- Consumes: the finished app.
- Produces: documentation only.

- [ ] **Step 1: Write the docs**

`README.md`:

```markdown
# Life Ambient

Conway's Game of Life as an ambient music composer. Place known Life
patterns on a 96x96 grid; living clusters become pad voices (pitch from
distance-to-center, pan from horizontal position, warble from shape
change), and cell births become soft percussive pings. Deaths are silent.

## Run

    npm install
    npm run dev

Open the printed URL, click "tap to start audio", pick a pattern, click
the grid to place it. `R` rotates the armed pattern.

## Develop

    npm test          # unit tests (engine, tracker, scale, allocation)
    npm run typecheck
    npm run build

Manual audio verification: docs/smoke-test.md.

## Architecture

LifeEngine (pure sim) -> ClusterTracker (stable cluster identities +
metrics) -> SoundMapper (Tone.js) with a thin canvas/DOM UI on top.
Design spec: docs/superpowers/specs/2026-07-13-life-ambient-music-design.md
```

`docs/smoke-test.md`:

```markdown
# Manual smoke test

Run `npm run dev`, open the URL, click "tap to start audio". Then verify:

1. **Empty board**: silence; hint text "pick a pattern, then click to place it".
2. **Birth pings**: stamp an Acorn; each generation's births produce soft
   staggered pings, never a harsh burst.
3. **Still-life drone**: clear, stamp a Block; a steady unwavering pad.
4. **Blinker warble**: stamp a Blinker; its pad pulses at period 2
   (brightness/level oscillation).
5. **Pentadecathlon**: slower, deeper cyclic warble (period 15).
6. **Glider arc**: stamp a Glider aimed across the center; pitch falls as
   it approaches center, rises after it passes; pan follows it.
7. **Gun**: stamp the Gosper gun; a stream of glider voices + pings;
   output stays controlled (limiter, ducking) after a minute.
8. **Key/scale**: while sound plays, change key and scale; pads glide to
   new pitches within one tick, no clicks or dissonant hangover.
9. **Pause-arrange**: pause, stamp several patterns (silent), press play;
   pads fade in.
10. **Clear**: all sound fades out over a few seconds; no stuck voices.
11. **Rate**: sweep speed 1-8 gen/s; pings track the new pulse.
12. **Volume**: slider attenuates smoothly; ducking still works.
```

- [ ] **Step 2: Final verification**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: everything green.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/smoke-test.md
git commit -m "docs: README and manual smoke-test checklist"
```
