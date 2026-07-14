import { describe, it, expect } from 'vitest';
import {
  serializeWorld,
  deserializeWorld,
  SCALE_ORDER,
  INSTRUMENT_ORDER,
  type WorldState,
  type WorldSettings,
} from '../src/world/codec';
import { KEYS, SCALES } from '../src/audio/scale';
import type { Cell } from '../src/engine/life';

const GRID = 96;

const baseSettings: WorldSettings = {
  rate: 4,
  key: 'D',
  scale: 'dorian',
  masterDb: -12,
  arpMode: true,
  arpDb: -9,
  arpMaxNotes: 8,
  arpInstrument: 'bell',
  arpJitterPct: 3,
};

function sortedCellStrings(cells: Cell[]): string[] {
  return cells.map(c => `${c.x},${c.y}`).sort();
}

function boardField(serialized: string): string {
  const parts = serialized.split('~');
  return parts[parts.length - 1];
}

function buildFull(gridW: number, gridH: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) cells.push({ x, y });
  }
  return cells;
}

function buildCheckerboard(gridW: number, gridH: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if ((x + y) % 2 === 0) cells.push({ x, y });
    }
  }
  return cells;
}

function assertRoundTrip(cells: Cell[], settings: WorldSettings = baseSettings): void {
  const state: WorldState = { cells, settings };
  const serialized = serializeWorld(state, GRID, GRID);
  const decoded = deserializeWorld(serialized);
  expect(decoded).not.toBeNull();
  expect(sortedCellStrings(decoded!.cells)).toEqual(sortedCellStrings(cells));
  expect(decoded!.settings).toEqual(settings);
}

// Splice a single `~`-joined field of a serialized world string, for
// constructing malformed variants of an otherwise-valid baseline.
function withField(serialized: string, index: number, value: string): string {
  const parts = serialized.split('~');
  parts[index] = value;
  return parts.join('~');
}

describe('SCALE_ORDER', () => {
  it('contains exactly the keys of SCALES (append-only contract)', () => {
    expect([...SCALE_ORDER].sort()).toEqual(Object.keys(SCALES).sort());
  });
});

describe('serializeWorld / deserializeWorld round trip', () => {
  it('round-trips an empty board', () => {
    assertRoundTrip([]);
  });

  it('round-trips a single cell at (0,0)', () => {
    assertRoundTrip([{ x: 0, y: 0 }]);
  });

  it('round-trips a single cell at (95,95)', () => {
    assertRoundTrip([{ x: 95, y: 95 }]);
  });

  it('round-trips a scattered sparse board', () => {
    assertRoundTrip([
      { x: 3, y: 5 },
      { x: 40, y: 12 },
      { x: 41, y: 12 },
      { x: 41, y: 13 },
      { x: 90, y: 2 },
      { x: 0, y: 95 },
      { x: 95, y: 0 },
      { x: 50, y: 50 },
    ]);
  });

  it('round-trips a full board (all alive)', () => {
    assertRoundTrip(buildFull(GRID, GRID));
  });

  it('round-trips an alternating checkerboard', () => {
    assertRoundTrip(buildCheckerboard(GRID, GRID));
  });
});

describe('board encoding choice', () => {
  it('picks the r (RLE) field for a sparse board', () => {
    const state: WorldState = {
      cells: [{ x: 3, y: 5 }, { x: 40, y: 12 }, { x: 90, y: 2 }],
      settings: baseSettings,
    };
    const serialized = serializeWorld(state, GRID, GRID);
    expect(boardField(serialized)[0]).toBe('r');
  });

  it('picks the x (raw base64url) field for a checkerboard', () => {
    const state: WorldState = { cells: buildCheckerboard(GRID, GRID), settings: baseSettings };
    const serialized = serializeWorld(state, GRID, GRID);
    expect(boardField(serialized)[0]).toBe('x');
  });

  // NOTE (deviation flag, test expectation only — codec.ts is unchanged): the
  // plan's test bullet groups "checkerboard/full pick x" together, but a fully
  // alive board RLEs to a single run (e.g. "9216o"), which is always far
  // shorter than the raw bitmap (~1536 chars for 96x96). The encoder correctly
  // picks 'r' for a full board; asserting 'x' here would just be wrong. Verified
  // by direct computation, not assumption.
  it('picks the r (RLE) field for a full board, since a single run beats raw', () => {
    const state: WorldState = { cells: buildFull(GRID, GRID), settings: baseSettings };
    const serialized = serializeWorld(state, GRID, GRID);
    expect(boardField(serialized)[0]).toBe('r');
    expect(boardField(serialized)).toBe(`r${GRID * GRID}o`);
  });
});

describe('settings survive a round trip across every enum value', () => {
  it('all 12 keys', () => {
    for (const key of KEYS) {
      assertRoundTrip([{ x: 1, y: 1 }], { ...baseSettings, key });
    }
  });

  it('all 6 scales', () => {
    for (const scale of SCALE_ORDER) {
      assertRoundTrip([{ x: 1, y: 1 }], { ...baseSettings, scale });
    }
  });

  it('all 3 arp instruments', () => {
    for (const arpInstrument of INSTRUMENT_ORDER) {
      assertRoundTrip([{ x: 1, y: 1 }], { ...baseSettings, arpInstrument });
    }
  });
});

describe('serializeWorld drops out-of-bounds cells', () => {
  it('silently omits cells outside [0, grid) from the encoded board', () => {
    const state: WorldState = {
      cells: [{ x: -1, y: 0 }, { x: 96, y: 5 }, { x: 10, y: 10 }],
      settings: baseSettings,
    };
    const serialized = serializeWorld(state, GRID, GRID);
    const decoded = deserializeWorld(serialized);
    expect(decoded).not.toBeNull();
    expect(sortedCellStrings(decoded!.cells)).toEqual(['10,10']);
  });
});

describe('deserializeWorld rejects malformed input', () => {
  const baseline = serializeWorld(
    { cells: [{ x: 1, y: 1 }, { x: 2, y: 2 }], settings: baseSettings },
    GRID,
    GRID,
  );

  it('returns null for empty string', () => {
    expect(deserializeWorld('')).toBeNull();
  });

  it('returns null for plain garbage', () => {
    expect(deserializeWorld('not a valid world string at all')).toBeNull();
  });

  it('returns null for wrong version', () => {
    expect(deserializeWorld(withField(baseline, 0, '2'))).toBeNull();
  });

  it('returns null for wrong field count', () => {
    const parts = baseline.split('~');
    expect(deserializeWorld(parts.slice(0, 12).join('~'))).toBeNull(); // one short
    expect(deserializeWorld(baseline + '~extra')).toBeNull(); // one too many
  });

  it('returns null for rate 0', () => {
    expect(deserializeWorld(withField(baseline, 3, '0'))).toBeNull();
  });

  it('returns null for rate 9', () => {
    expect(deserializeWorld(withField(baseline, 3, '9'))).toBeNull();
  });

  it('returns null for non-numeric rate', () => {
    expect(deserializeWorld(withField(baseline, 3, 'abc'))).toBeNull();
  });

  it('returns null for keyIdx 12', () => {
    expect(deserializeWorld(withField(baseline, 4, '12'))).toBeNull();
  });

  it('returns null for scaleIdx 6', () => {
    expect(deserializeWorld(withField(baseline, 5, '6'))).toBeNull();
  });

  it('returns null for instIdx 3', () => {
    expect(deserializeWorld(withField(baseline, 10, '3'))).toBeNull();
  });

  it('returns null for masterDb 5 (positive, out of -60..0)', () => {
    expect(deserializeWorld(withField(baseline, 6, '5'))).toBeNull();
  });

  it('returns null for RLE with a stray character', () => {
    expect(deserializeWorld(withField(baseline, 12, 'r3b2z1o'))).toBeNull();
  });

  it('returns null for RLE overrunning the grid', () => {
    expect(deserializeWorld(withField(baseline, 12, 'r10000o'))).toBeNull();
  });

  it('returns null for RLE with a zero run', () => {
    expect(deserializeWorld(withField(baseline, 12, 'r0b'))).toBeNull();
  });

  it('returns null for a truncated base64 board', () => {
    expect(deserializeWorld(withField(baseline, 12, 'xAB'))).toBeNull();
  });

  it('returns null for base64 with an invalid character', () => {
    const dense = serializeWorld(
      { cells: buildCheckerboard(GRID, GRID), settings: baseSettings },
      GRID,
      GRID,
    );
    const field = boardField(dense);
    expect(field[0]).toBe('x'); // sanity: this baseline actually exercises the base64 path
    const corrupted = field[0] + '!' + field.slice(2);
    expect(deserializeWorld(withField(dense, 12, corrupted))).toBeNull();
  });
});

describe('RLE trailing dead run omission', () => {
  it('decodes a hand-built string with an omitted trailing dead run', () => {
    const decoded = deserializeWorld('1~4~4~1~0~0~0~0~0~1~0~0~r1o');
    expect(decoded).not.toBeNull();
    expect(decoded!.cells).toEqual([{ x: 0, y: 0 }]);
  });
});
