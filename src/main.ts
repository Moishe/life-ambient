import * as Tone from 'tone';
import { LifeEngine } from './engine/life';
import { placePattern, rotateCells } from './engine/patterns';
import { ClusterTracker, type ClusterEvents } from './tracker/cluster';
import { SoundMapper } from './audio/soundMapper';
import { Renderer } from './ui/renderer';
import { buildControls, buildArpPanel, type Tool } from './ui/controls';
import { Recorder } from './recording/recorder';
import { formatElapsed, recordingFilename } from './recording/format';

const GRID = 96;

const canvas = document.querySelector<HTMLCanvasElement>('#board');
const controlsRoot = document.querySelector<HTMLElement>('#controls');
const paletteRoot = document.querySelector<HTMLElement>('#palette');
const arpPanelRoot = document.querySelector<HTMLElement>('#arp-panel');
const gate = document.querySelector<HTMLElement>('#gate');
const startBtn = document.querySelector<HTMLButtonElement>('#start-btn');
if (!canvas || !controlsRoot || !paletteRoot || !arpPanelRoot || !gate || !startBtn) {
  throw new Error('missing root elements');
}

const engine = new LifeEngine(GRID, GRID);
const tracker = new ClusterTracker(GRID, GRID);
const mapper = new SoundMapper();
const renderer = new Renderer(canvas, GRID, GRID);

// Ids of clusters born while arpeggio mode is on; handed to the renderer as a
// live reference (mutations are visible without re-calling setArpIds).
const arpIds = new Set<number>();
renderer.setArpIds(arpIds);

let playing = true;
let rate = 4; // generations per second
let tool: Tool = { kind: 'paint' };
let rotation = 0;
let arpMode = false;
let cursor: { x: number; y: number } | null = null;
let repeatId: number | null = null;

const recorder = new Recorder(canvas, () => mapper.captureStream());
let recordTimer: number | null = null;

// Registry invariant: ids enter arpIds ONLY when born while the mode is on,
// and leave ONLY on death. Runs on every tracker update (tick and refresh).
function updateArpRegistry(events: ClusterEvents): void {
  if (arpMode) for (const m of events.born) arpIds.add(m.id);
  for (const id of events.died) arpIds.delete(id);
}

function tick(): void {
  const { births, deaths } = engine.tick();
  const events = tracker.update(engine.liveCells());
  updateArpRegistry(events);
  mapper.handleTick(events, births, engine.population(), 1 / rate, GRID, GRID, arpIds);
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
  updateArpRegistry(events);
  if (!silent) {
    mapper.handleTick(events, [], engine.population(), 1 / rate, GRID, GRID, arpIds);
  }
  renderer.setClusters([...events.born, ...events.updated]);
}

function setIdleRecordUi(): void {
  ui.setRecordState({ recording: false, label: '● Rec', enabled: Recorder.supported() });
}

function updateRecordUi(): void {
  if (!recorder.isRecording) {
    // Recorder died via onerror: deliver the partial file.
    void finishRecording();
    return;
  }
  ui.setRecordState({
    recording: true,
    label: `■ ${formatElapsed(recorder.elapsedSec)}`,
    enabled: true,
  });
}

async function finishRecording(): Promise<void> {
  if (recordTimer !== null) {
    clearInterval(recordTimer);
    recordTimer = null;
  }
  const { blob, mimeType } = await recorder.stop();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = recordingFilename(mimeType, new Date());
  a.click();
  // Deferred: revoking synchronously can abort the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setIdleRecordUi();
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
  onRecordToggle() {
    if (!Recorder.supported()) return;
    if (recorder.isRecording) {
      void finishRecording();
      return;
    }
    recorder.start();
    updateRecordUi();
    recordTimer = window.setInterval(updateRecordUi, 1000);
  },
});

setIdleRecordUi();

const arpUi = buildArpPanel(arpPanelRoot, {
  onModeToggle() {
    toggleArpMode();
  },
  onArpVolume(db) {
    mapper.setArpVolume(db);
  },
  onArpMaxNotes(n) {
    mapper.setArpMaxNotes(n);
  },
  onArpInstrument(instrument) {
    mapper.setArpInstrument(instrument);
  },
  onArpJitter(pct) {
    mapper.setArpJitter(pct);
  },
});

function toggleArpMode(): void {
  arpMode = !arpMode;
  arpUi.setMode(arpMode);
}

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
  if (ev.key === 'a' || ev.key === 'A') toggleArpMode();
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

// --- on-screen diagnostics (?debug) ---

if (new URLSearchParams(location.search).has('debug')) {
  const panel = document.createElement('pre');
  panel.style.cssText =
    'position:fixed;bottom:8px;left:8px;z-index:99;background:rgba(11,14,20,0.85);' +
    'color:#7aa2f7;font:11px/1.5 monospace;padding:8px 10px;border:1px solid #232936;' +
    'border-radius:8px;pointer-events:none;max-width:80vw;white-space:pre-wrap;';
  document.body.appendChild(panel);
  const errors: string[] = [];
  const note = (msg: unknown) => {
    errors.push(String(msg));
    if (errors.length > 3) errors.shift();
  };
  window.addEventListener('error', e => note(e.message));
  window.addEventListener('unhandledrejection', e => note(e.reason));
  setInterval(() => {
    const ctx = Tone.getContext();
    panel.textContent = [
      `audio state: ${ctx.state}`,
      `sample rate: ${ctx.sampleRate}`,
      `tone now: ${Tone.now().toFixed(1)}`,
      `transport: ${Tone.getTransport().state}`,
      `population: ${engine.population()}`,
      `dest volume: ${Tone.getDestination().volume.value.toFixed(1)} dB`,
      `dest muted: ${Tone.getDestination().mute}`,
      errors.length ? `errors: ${errors.join(' | ')}` : 'errors: none',
    ].join('\n');
  }, 500);
}
