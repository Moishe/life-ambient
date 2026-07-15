import { PATTERNS, type Pattern, type PatternCategory } from '../engine/patterns';
import { KEYS, SCALES, type KeyName, type ScaleName } from '../audio/scale';
import type { ArpInstrument } from '../audio/arpeggio';

export type Tool = { kind: 'pattern'; pattern: Pattern } | { kind: 'paint' };

export interface ControlCallbacks {
  onPlayToggle(): void;
  onRateChange(gensPerSec: number): void;
  onKeyChange(key: KeyName): void;
  onScaleChange(scale: ScaleName): void;
  onVolumeChange(db: number): void;
  onClear(): void;
  onToolChange(tool: Tool): void;
  onRecordToggle(): void;
}

const CATEGORY_LABELS: Record<PatternCategory, string> = {
  drone: 'Drones',
  pulse: 'Pulses',
  voyager: 'Voyagers',
  fountain: 'Fountains',
  wildcard: 'Wildcards',
};

const SCALE_LABELS: Record<ScaleName, string> = {
  majorPentatonic: 'Major pentatonic',
  minorPentatonic: 'Minor pentatonic',
  lydian: 'Lydian',
  dorian: 'Dorian',
  wholeTone: 'Whole tone',
  aeolian: 'Aeolian',
};

export function buildControls(
  controlsRoot: HTMLElement,
  paletteRoot: HTMLElement,
  cb: ControlCallbacks,
): {
  setPlaying(playing: boolean): void;
  setRecordState(state: { recording: boolean; label: string; enabled: boolean }): void;
} {
  // --- palette ---
  const buttons: HTMLButtonElement[] = [];
  const select = (btn: HTMLButtonElement, tool: Tool) => {
    for (const b of buttons) b.classList.remove('selected');
    btn.classList.add('selected');
    cb.onToolChange(tool);
  };

  const paintBtn = document.createElement('button');
  paintBtn.textContent = 'Paint cells';
  paintBtn.addEventListener('click', () => select(paintBtn, { kind: 'paint' }));
  paletteRoot.appendChild(paintBtn);
  buttons.push(paintBtn);

  for (const category of Object.keys(CATEGORY_LABELS) as PatternCategory[]) {
    const heading = document.createElement('h3');
    heading.textContent = CATEGORY_LABELS[category];
    paletteRoot.appendChild(heading);
    for (const pattern of PATTERNS.filter(p => p.category === category)) {
      const btn = document.createElement('button');
      btn.textContent = pattern.name;
      btn.addEventListener('click', () => select(btn, { kind: 'pattern', pattern }));
      paletteRoot.appendChild(btn);
      buttons.push(btn);
    }
  }

  // --- controls row ---
  const playBtn = document.createElement('button');
  playBtn.textContent = 'Pause';
  playBtn.addEventListener('click', () => cb.onPlayToggle());
  controlsRoot.appendChild(playBtn);

  const rate = document.createElement('input');
  rate.type = 'range';
  rate.min = '1';
  rate.max = '8';
  rate.step = '1';
  rate.value = '4';
  rate.addEventListener('input', () => cb.onRateChange(Number(rate.value)));
  controlsRoot.appendChild(labeled('speed', rate));

  const keySelect = document.createElement('select');
  for (const k of KEYS) keySelect.appendChild(new Option(k, k));
  keySelect.addEventListener('change', () => cb.onKeyChange(keySelect.value as KeyName));
  controlsRoot.appendChild(labeled('key', keySelect));

  const scaleSelect = document.createElement('select');
  for (const s of Object.keys(SCALES) as ScaleName[]) {
    scaleSelect.appendChild(new Option(SCALE_LABELS[s], s));
  }
  scaleSelect.addEventListener('change', () => cb.onScaleChange(scaleSelect.value as ScaleName));
  controlsRoot.appendChild(labeled('scale', scaleSelect));

  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '-30';
  volume.max = '0';
  volume.step = '1';
  volume.value = '-6';
  volume.addEventListener('input', () => cb.onVolumeChange(Number(volume.value)));
  controlsRoot.appendChild(labeled('volume', volume));
  // Sync UI and mapper state from construction (before any slider touch).
  cb.onVolumeChange(Number(volume.value));

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => cb.onClear());
  controlsRoot.appendChild(clearBtn);

  const recordBtn = document.createElement('button');
  recordBtn.textContent = '● Rec';
  recordBtn.addEventListener('click', () => cb.onRecordToggle());
  controlsRoot.appendChild(recordBtn);

  const hint = document.createElement('span');
  hint.textContent = 'R rotates the armed pattern';
  hint.style.color = '#6b7280';
  controlsRoot.appendChild(hint);

  return {
    setPlaying(playing: boolean) {
      playBtn.textContent = playing ? 'Pause' : 'Play';
    },
    setRecordState(state: { recording: boolean; label: string; enabled: boolean }) {
      recordBtn.textContent = state.label;
      recordBtn.disabled = !state.enabled;
      recordBtn.title = state.enabled ? '' : 'Recording is not supported in this browser';
      recordBtn.classList.toggle('recording', state.recording);
    },
  };
}

function labeled(text: string, el: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.append(text, el);
  return label;
}

export interface ArpPanelCallbacks {
  onModeToggle(): void;
  onArpVolume(db: number): void;
  onArpMaxNotes(n: number): void;
  onArpInstrument(instrument: ArpInstrument): void;
  onArpJitter(pct: number): void;
}

const ARP_INSTRUMENT_LABELS: Record<ArpInstrument, string> = {
  pluck: 'Pluck',
  bell: 'Bell',
  keys: 'Soft Keys',
};

export function buildArpPanel(
  root: HTMLElement,
  cb: ArpPanelCallbacks,
): { setMode(active: boolean): void } {
  const heading = document.createElement('h3');
  heading.textContent = 'Arpeggios';
  root.appendChild(heading);

  const toggle = document.createElement('button');
  toggle.textContent = 'Arpeggio mode';
  toggle.addEventListener('click', () => cb.onModeToggle());
  root.appendChild(toggle);

  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '-30';
  volume.max = '6';
  volume.step = '1';
  volume.value = '-10';
  volume.addEventListener('input', () => cb.onArpVolume(Number(volume.value)));
  root.appendChild(stacked('volume', volume));
  // Fired once at build so UI and SoundMapper agree from the start. The other
  // controls rely on their defaults matching SoundMapper's fields (16 / pluck / 1%);
  // change either side and you must sync the other.
  cb.onArpVolume(Number(volume.value));

  const maxNotes = document.createElement('input');
  maxNotes.type = 'range';
  maxNotes.min = '4';
  maxNotes.max = '16';
  maxNotes.step = '1';
  maxNotes.value = '16';
  maxNotes.addEventListener('input', () => cb.onArpMaxNotes(Number(maxNotes.value)));
  root.appendChild(stacked('max notes/gen', maxNotes));

  const instrument = document.createElement('select');
  for (const id of Object.keys(ARP_INSTRUMENT_LABELS) as ArpInstrument[]) {
    instrument.appendChild(new Option(ARP_INSTRUMENT_LABELS[id], id));
  }
  instrument.addEventListener('change', () =>
    cb.onArpInstrument(instrument.value as ArpInstrument),
  );
  root.appendChild(stacked('instrument', instrument));

  const jitter = document.createElement('input');
  jitter.type = 'range';
  jitter.min = '0';
  jitter.max = '5';
  jitter.step = '0.5';
  jitter.value = '1';
  jitter.addEventListener('input', () => cb.onArpJitter(Number(jitter.value)));
  root.appendChild(stacked('jitter %', jitter));

  return {
    setMode(active: boolean) {
      toggle.classList.toggle('active', active);
      toggle.textContent = active ? 'Arpeggio mode: ON' : 'Arpeggio mode';
    },
  };
}

function stacked(text: string, el: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'stack';
  const span = document.createElement('span');
  span.textContent = text;
  label.append(span, el);
  return label;
}
