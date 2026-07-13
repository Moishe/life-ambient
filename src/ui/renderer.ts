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
