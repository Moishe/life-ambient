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
