import * as Tone from 'tone';
import { LifeEngine } from './engine/life';
import { placePattern, rotateCells } from './engine/patterns';
import { ClusterTracker, type ClusterEvents } from './tracker/cluster';
import { SoundMapper } from './audio/soundMapper';
import { Renderer } from './ui/renderer';
import {
  buildControls,
  buildArpPanel,
  buildMoodPanel,
  buildWorldPanel,
  type Tool,
} from './ui/controls';
import { Recorder } from './recording/recorder';
import { formatElapsed, recordingFilename } from './recording/format';
import { serializeWorld, deserializeWorld, type WorldState } from './world/codec';
import { MOODS, generateMoodWorld } from './world/moods';

const GRID = 96;

// Silence gap when switching moods: long enough for the 4 s pad release to
// mostly fade under the reverb tail, short enough to feel like a breath, not a stall.
const TRANSITION_MS = 3000;

const canvas = document.querySelector<HTMLCanvasElement>('#board');
const controlsRoot = document.querySelector<HTMLElement>('#controls');
const paletteRoot = document.querySelector<HTMLElement>('#palette');
const arpPanelRoot = document.querySelector<HTMLElement>('#arp-panel');
const worldPanelRoot = document.querySelector<HTMLElement>('#world-panel');
const gate = document.querySelector<HTMLElement>('#gate');
const startBtn = document.querySelector<HTMLButtonElement>('#start-btn');
if (
  !canvas ||
  !controlsRoot ||
  !paletteRoot ||
  !arpPanelRoot ||
  !worldPanelRoot ||
  !gate ||
  !startBtn
) {
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
let finishing = false;

// Handle for a pending mood transition (the silence gap before the new world
// lands). number via window.setTimeout, mirroring recordTimer.
let moodTimer: number | null = null;

// Cancels any in-flight mood transition: clears the timeout, drops the pending
// pulse. Returns whether a transition was actually pending (callers use this to
// decide whether to also clear the active-mood highlight). Called wherever an
// action supersedes the incoming world.
function cancelMoodTransition(): boolean {
  const wasPending = moodTimer !== null;
  if (moodTimer !== null) {
    window.clearTimeout(moodTimer);
    moodTimer = null;
  }
  moodUi.setPendingMood(null);
  return wasPending;
}

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
  if (finishing) return;
  finishing = true;
  try {
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
  } finally {
    finishing = false;
  }
}

// Mood buttons sit at the TOP of the palette, so build them before the tools.
const moodUi = buildMoodPanel(
  paletteRoot,
  MOODS.map(m => ({ id: m.id, name: m.name, tagline: m.tagline })),
  {
    onMood(id) {
      const mood = MOODS.find(m => m.id === id);
      if (!mood) return;
      // Roll the dice NOW so the arrangement is fixed at click time; it lands
      // after the gap. Clearing the board first fades every voice out (same as
      // onClear), leaving ~3 s of quiet before the new world sounds.
      const newState = generateMoodWorld(mood, GRID, GRID, Math.random, mapper.snapshotSettings());
      cancelMoodTransition();
      engine.clear();
      refresh(false); // audible: releases every pad/arp, ramps out the drone
      moodUi.setActiveMood(id); // instant feedback
      moodUi.setPendingMood(id); // breathing pulse during the gap
      moodTimer = window.setTimeout(() => {
        moodTimer = null;
        applyWorld(newState);
        moodUi.setActiveMood(id);
        moodUi.setPendingMood(null);
      }, TRANSITION_MS);
    },
  },
);

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
    cancelMoodTransition();
    engine.clear();
    refresh(false); // audible: releases all pads
    moodUi.setActiveMood(null);
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
    if (recordTimer !== null) {
      clearInterval(recordTimer); // stale interval from an onerror double-fault
      recordTimer = null;
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

// --- worlds: moods, save/load, share ---

const STORAGE_KEY = 'life-ambient.worlds.v1';

function readSavedWorlds(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function writeSavedWorlds(map: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage full or blocked: saving silently fails, sharing still works
  }
}

function currentWorld(): WorldState {
  return {
    cells: engine.liveCells(),
    settings: { rate, key: mapper.key, scale: mapper.scale, arpMode, ...mapper.snapshotSettings() },
  };
}

/** Replace the whole world. Settings go first — arp mode BEFORE the board
 *  refresh, because the arp registry only admits clusters born while the mode
 *  is on. Board last, with click-editing semantics (silent while paused; the
 *  orphan reconcile settles voices on resume). */
function applyWorld(state: WorldState): void {
  const s = state.settings;
  rate = s.rate;
  scheduleLoop();
  ui.setRate(s.rate);
  mapper.setKeyScale(s.key, s.scale);
  ui.setKey(s.key);
  ui.setScale(s.scale);
  mapper.setMasterVolume(s.masterDb);
  ui.setVolume(s.masterDb);
  mapper.setArpVolume(s.arpDb);
  mapper.setArpMaxNotes(s.arpMaxNotes);
  mapper.setArpInstrument(s.arpInstrument);
  mapper.setArpJitter(s.arpJitterPct);
  arpUi.setSettings({
    db: s.arpDb,
    maxNotes: s.arpMaxNotes,
    instrument: s.arpInstrument,
    jitterPct: s.arpJitterPct,
  });
  if (arpMode !== s.arpMode) toggleArpMode();
  engine.clear();
  for (const c of state.cells) engine.set(c.x, c.y, true);
  refresh(!playing);
}

const worldUi = buildWorldPanel(worldPanelRoot, {
  onSaveRequest(name) {
    const map = readSavedWorlds();
    map[name] = serializeWorld(currentWorld(), GRID, GRID);
    writeSavedWorlds(map);
    worldUi.setSavedNames(Object.keys(map).sort());
  },
  onLoadRequest(name) {
    const map = readSavedWorlds();
    const serialized = map[name];
    if (serialized === undefined) return;
    const state = deserializeWorld(serialized);
    if (state) {
      cancelMoodTransition();
      applyWorld(state);
      moodUi.setActiveMood(null);
    }
  },
  onDeleteRequest(name) {
    const map = readSavedWorlds();
    delete map[name];
    writeSavedWorlds(map);
    worldUi.setSavedNames(Object.keys(map).sort());
  },
  async onShareRequest() {
    const link = `${location.origin}${location.pathname}#w=${serializeWorld(currentWorld(), GRID, GRID)}`;
    try {
      await navigator.clipboard.writeText(link);
      return true;
    } catch {
      return false;
    }
  },
});
worldUi.setSavedNames(Object.keys(readSavedWorlds()).sort());

// A world carried in the URL fragment; applied once, after the audio gate.
const hashMatch = location.hash.match(/^#w=(.+)$/);
const pendingWorld = hashMatch ? deserializeWorld(hashMatch[1]) : null;

// Arm the default paint tool visually (buildControls highlights no button at
// load). Select a `.tool` button specifically — mood buttons now top the palette.
paletteRoot.querySelector<HTMLButtonElement>('button.tool')?.click();

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
  // A board edit wins over a pending mood: the incoming world must not land.
  if (cancelMoodTransition()) moodUi.setActiveMood(null);
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
    if (pendingWorld) {
      cancelMoodTransition();
      applyWorld(pendingWorld);
      moodUi.setActiveMood(null);
    }
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
