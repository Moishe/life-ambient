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
