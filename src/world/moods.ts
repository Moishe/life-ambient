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
