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
