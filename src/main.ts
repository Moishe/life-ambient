import * as Tone from 'tone';
import { LifeEngine } from './engine/life';
import { placePattern, rotateCells } from './engine/patterns';
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

// Arm the default paint tool visually (buildControls highlights no button at load).
paletteRoot.querySelector('button')?.click();

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
