import { describe, it, expect } from 'vitest';
import { PATTERNS } from '../src/engine/patterns';
import { KEYS } from '../src/audio/scale';
import {
  MOODS,
  MARGIN,
  GAP,
  planMood,
  generateMoodWorld,
  type Mood,
  type Placement,
  type MoodBase,
} from '../src/world/moods';

const GRID = 96;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const patternIds = new Set(PATTERNS.map(p => p.id));

// Recompute the bounding box of a placement, applying rotation parity to w/h.
function boxOf(p: Placement): { x: number; y: number; w: number; h: number } {
  const w = p.rotation % 2 === 0 ? p.pattern.width : p.pattern.height;
  const h = p.rotation % 2 === 0 ? p.pattern.height : p.pattern.width;
  return { x: p.x, y: p.y, w, h };
}

function boxesSeparated(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap: number,
): boolean {
  return (
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function groupMaxSum(mood: Mood): number {
  return mood.groups.reduce((acc, g) => acc + g.count[1], 0);
}

const testBase: MoodBase = {
  masterDb: -7,
  arpDb: -12,
  arpMaxNotes: 5,
  arpInstrument: 'pluck',
  arpJitterPct: 2,
};

describe('mood definitions', () => {
  it('every patternIds entry in every mood resolves to a real pattern id', () => {
    for (const mood of MOODS) {
      for (const group of mood.groups) {
        for (const id of group.patternIds) {
          expect(patternIds.has(id), `${mood.id}: ${id}`).toBe(true);
        }
      }
    }
  });

  it('each mood declares at least one scale and all scales are non-empty strings', () => {
    for (const mood of MOODS) {
      expect(mood.scales.length, mood.id).toBeGreaterThan(0);
    }
  });
});

describe('planMood placement geometry', () => {
  for (const mood of MOODS) {
    for (const seed of SEEDS) {
      it(`${mood.id} seed ${seed}: placements fit within margins and are GAP-separated`, () => {
        const placements = planMood(mood, GRID, GRID, mulberry32(seed));

        // Placement count > 0 and ≤ sum of group maxima.
        expect(placements.length).toBeGreaterThan(0);
        expect(placements.length).toBeLessThanOrEqual(groupMaxSum(mood));

        const boxes = placements.map(boxOf);

        // Every bounding box stays MARGIN off the walls.
        for (const b of boxes) {
          expect(b.x).toBeGreaterThanOrEqual(MARGIN);
          expect(b.y).toBeGreaterThanOrEqual(MARGIN);
          expect(b.x + b.w).toBeLessThanOrEqual(GRID - MARGIN);
          expect(b.y + b.h).toBeLessThanOrEqual(GRID - MARGIN);
        }

        // Pairwise GAP separation.
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(
              boxesSeparated(boxes[i], boxes[j], GAP),
              `${mood.id} seed ${seed}: boxes ${i}/${j} overlap`,
            ).toBe(true);
          }
        }
      });
    }
  }

  it('same seed produces deep-equal placements (determinism)', () => {
    for (const mood of MOODS) {
      for (const seed of SEEDS) {
        const a = planMood(mood, GRID, GRID, mulberry32(seed));
        const b = planMood(mood, GRID, GRID, mulberry32(seed));
        expect(a, `${mood.id} seed ${seed}`).toEqual(b);
      }
    }
  });
});

describe('generateMoodWorld cells', () => {
  for (const mood of MOODS) {
    for (const seed of SEEDS) {
      it(`${mood.id} seed ${seed}: cells are in bounds and unique`, () => {
        const world = generateMoodWorld(mood, GRID, GRID, mulberry32(seed), testBase);

        // In-bounds within [MARGIN, GRID - MARGIN).
        for (const c of world.cells) {
          expect(c.x).toBeGreaterThanOrEqual(MARGIN);
          expect(c.y).toBeGreaterThanOrEqual(MARGIN);
          expect(c.x).toBeLessThan(GRID - MARGIN);
          expect(c.y).toBeLessThan(GRID - MARGIN);
        }

        // No duplicate cells (separation implies disjoint patterns).
        const keys = world.cells.map(c => `${c.x},${c.y}`);
        expect(new Set(keys).size).toBe(keys.length);
      });
    }
  }
});

describe('generateMoodWorld settings', () => {
  for (const mood of MOODS) {
    for (const seed of SEEDS) {
      it(`${mood.id} seed ${seed}: settings honour the mood and pass base through`, () => {
        const world = generateMoodWorld(mood, GRID, GRID, mulberry32(seed), testBase);
        const s = world.settings;

        // rate: integer within rateRange.
        expect(Number.isInteger(s.rate)).toBe(true);
        expect(s.rate).toBeGreaterThanOrEqual(mood.rateRange[0]);
        expect(s.rate).toBeLessThanOrEqual(mood.rateRange[1]);

        // scale ∈ mood.scales, key ∈ KEYS.
        expect(mood.scales).toContain(s.scale);
        expect(KEYS as readonly string[]).toContain(s.key);

        // arpMode matches the mood.
        expect(s.arpMode).toBe(mood.arpMode);

        // base volumes / notes / jitter pass through untouched.
        expect(s.masterDb).toBe(testBase.masterDb);
        expect(s.arpDb).toBe(testBase.arpDb);
        expect(s.arpMaxNotes).toBe(testBase.arpMaxNotes);
        expect(s.arpJitterPct).toBe(testBase.arpJitterPct);

        // instrument is the mood's when it claims one, else the base's.
        expect(s.arpInstrument).toBe(mood.arpInstrument ?? testBase.arpInstrument);
      });
    }
  }

  it('Music Box claims the bell instrument', () => {
    const musicbox = MOODS.find(m => m.id === 'musicbox')!;
    expect(musicbox.arpInstrument).toBe('bell');
    for (const seed of SEEDS) {
      const world = generateMoodWorld(musicbox, GRID, GRID, mulberry32(seed), testBase);
      expect(world.settings.arpInstrument).toBe('bell');
      expect(world.settings.arpMode).toBe(true);
    }
  });
});

describe('Fountain always places the Gosper gun', () => {
  const fountain = MOODS.find(m => m.id === 'fountain')!;
  for (const seed of SEEDS) {
    it(`seed ${seed}: at least one gosperGun placement`, () => {
      const placements = planMood(fountain, GRID, GRID, mulberry32(seed));
      expect(placements.some(p => p.pattern.id === 'gosperGun')).toBe(true);
    });
  }
});
