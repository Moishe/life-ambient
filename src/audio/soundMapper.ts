import * as Tone from 'tone';
import type { Cell } from '../engine/life';
import type { ClusterEvents, ClusterMetrics } from '../tracker/cluster';
import { cellRadial } from '../geometry';
import {
  KEYS,
  midiToFreq,
  quantize,
  radialToDegree,
  degreeToFreq,
  type KeyName,
  type ScaleName,
} from './scale';
import { allocateVoices, orphanedVoiceIds, planPings } from './allocation';
import { deriveArpeggio, type ArpInstrument, type ArpNote } from './arpeggio';

const PAD_BASE_MIDI = 48; // C3
const PING_BASE_MIDI = 72; // C5, two octaves above the pad register
const MAX_PADS = 16;
const ARP_BASE_MIDI = 60; // one octave above pads, one below pings
const ARP_MAX_MIDI = 108; // C8 — wide clusters fold down instead of going ultrasonic
const MAX_ARPS = 8;
const ARP_GATE = 0.9;

class PadVoice {
  private gain = new Tone.Gain(0);
  private panner = new Tone.Panner(0);
  private filter = new Tone.Filter(800, 'lowpass');
  private oscA = new Tone.Oscillator(220, 'sawtooth');
  private oscB = new Tone.Oscillator(220, 'triangle');
  private vibrato = new Tone.LFO(4, -12, 12); // cents into oscA.detune

  constructor(out: Tone.ToneAudioNode) {
    this.oscA.connect(this.filter);
    this.oscB.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.connect(out);
    this.vibrato.connect(this.oscA.detune);
    this.vibrato.amplitude.value = 0;
    this.oscA.start();
    this.oscB.start();
    this.vibrato.start();
  }

  apply(m: ClusterMetrics, freq: number, rampSec: number): void {
    this.oscA.frequency.rampTo(freq, 0.2);
    const detuneCents = 3 + Math.min(12, m.cellCount * 0.4);
    this.oscB.frequency.rampTo(freq * Math.pow(2, detuneCents / 1200), 0.2);

    const vol = Math.min(0.22, 0.04 + Math.log2(1 + m.cellCount) * 0.03);
    const warble = Math.min(0.6, Math.abs(m.delta) * 0.1);
    this.gain.gain.rampTo(vol * (1 - 0.4 * warble), rampSec);

    const aspectNorm = Math.min(4, Math.max(0.25, m.aspect));
    this.filter.frequency.rampTo(350 + aspectNorm * 450 + warble * 900, rampSec);

    this.panner.pan.rampTo(Math.max(-1, Math.min(1, m.pan)), 0.5);
    this.vibrato.amplitude.rampTo(Math.min(1, m.velocity / 1.5), 0.5);
  }

  mute(): void {
    this.gain.gain.rampTo(0, 1);
  }

  release(): void {
    this.gain.gain.cancelScheduledValues(Tone.now());
    this.gain.gain.rampTo(0, 4);
    setTimeout(() => this.dispose(), 4500);
  }

  private dispose(): void {
    for (const node of [this.oscA, this.oscB, this.vibrato, this.filter, this.gain, this.panner]) {
      node.dispose();
    }
  }
}

class ArpVoice {
  private synth: Tone.PluckSynth | Tone.FMSynth | Tone.AMSynth;
  private panner = new Tone.Panner(0);

  constructor(out: Tone.ToneAudioNode, instrument: ArpInstrument) {
    switch (instrument) {
      case 'bell':
        this.synth = new Tone.FMSynth({
          harmonicity: 3.01,
          modulationIndex: 14,
          envelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.4 },
          modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 },
          volume: -10,
        });
        break;
      case 'keys':
        this.synth = new Tone.AMSynth({
          harmonicity: 2,
          envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.6 },
          volume: -8,
        });
        break;
      default:
        this.synth = new Tone.PluckSynth({ dampening: 3500, resonance: 0.9, volume: -6 });
    }
    this.synth.connect(this.panner);
    this.panner.connect(out);
  }

  schedule(
    notes: ArpNote[],
    rootDegree: number,
    key: KeyName,
    scale: ScaleName,
    tickSec: number,
    when: number,
    jitterPct: number,
    pan: number,
  ): void {
    if (notes.length === 0) return;
    this.panner.pan.rampTo(Math.max(-1, Math.min(1, pan)), 0.5);
    const slot = tickSec / notes.length;
    for (const n of notes) {
      const freq = degreeToFreq(rootDegree + n.degreeOffset, key, scale, ARP_BASE_MIDI, ARP_MAX_MIDI);
      const jitter = (Math.random() * 2 - 1) * (jitterPct / 100) * slot;
      const t = Math.max(when, when + n.row * slot + jitter);
      this.synth.triggerAttackRelease(freq, slot * ARP_GATE, t, 0.5);
    }
  }

  dispose(): void {
    this.synth.dispose();
    this.panner.dispose();
  }
}

export class SoundMapper {
  key: KeyName = 'C';
  scale: ScaleName = 'majorPentatonic';

  private busIn!: Tone.Filter;
  private reverb!: Tone.Reverb;
  private duckGain!: Tone.Gain;
  private limiter!: Tone.Limiter;
  private pingSynth!: Tone.PolySynth;
  private anchorRoot!: Tone.Oscillator;
  private anchorFifth!: Tone.Oscillator;
  private anchorGain!: Tone.Gain;
  private pads = new Map<number, PadVoice>();
  private arps = new Map<number, ArpVoice>();
  private arpGain!: Tone.Gain;
  private arpDb = -10;
  private arpInstrument: ArpInstrument = 'pluck';
  private arpMaxNotes = 16;
  private arpJitterPct = 1;
  private ready = false;
  private masterDb = -6;
  private streamDest: MediaStreamAudioDestinationNode | null = null;

  async init(): Promise<void> {
    this.limiter = new Tone.Limiter(-3).toDestination();
    this.duckGain = new Tone.Gain(1).connect(this.limiter);
    this.reverb = new Tone.Reverb({ decay: 8, wet: 0.55 }).connect(this.duckGain);
    this.busIn = new Tone.Filter(4500, 'lowpass').connect(this.reverb);
    await this.reverb.ready;

    this.pingSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 5.1,
      modulationIndex: 8,
      envelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.3 },
      modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
      volume: -18,
    }).connect(this.busIn);

    this.anchorGain = new Tone.Gain(0).connect(this.busIn);
    this.anchorRoot = new Tone.Oscillator(midiToFreq(36), 'sine').connect(this.anchorGain).start();
    this.anchorFifth = new Tone.Oscillator(midiToFreq(43), 'triangle')
      .connect(this.anchorGain)
      .start();
    this.arpGain = new Tone.Gain(Math.pow(10, this.arpDb / 20)).connect(this.busIn);
    Tone.getDestination().volume.value = this.masterDb;
    this.ready = true;
  }

  setKeyScale(key: KeyName, scale: ScaleName): void {
    this.key = key;
    this.scale = scale;
    if (!this.ready) return;
    const root = 36 + KEYS.indexOf(key);
    this.anchorRoot.frequency.rampTo(midiToFreq(root), 1);
    this.anchorFifth.frequency.rampTo(midiToFreq(root + 7), 1);
    // sounding pads glide to requantized pitches on their next handleTick
  }

  setMasterVolume(db: number): void {
    this.masterDb = db;
    if (this.ready) Tone.getDestination().volume.rampTo(db, 0.1);
  }

  /**
   * Audio stream of the mastered mix (post-limiter), for recording.
   * The node is created once and cached: its single audio track is shared
   * with every recording, so callers must never stop() that track.
   */
  captureStream(): MediaStream {
    if (!this.ready) throw new Error('captureStream() before init()');
    if (!this.streamDest) {
      const raw = Tone.getContext().rawContext as AudioContext;
      this.streamDest = raw.createMediaStreamDestination();
      this.limiter.connect(this.streamDest);
    }
    return this.streamDest.stream;
  }

  setArpVolume(db: number): void {
    this.arpDb = db;
    if (this.ready) this.arpGain.gain.rampTo(Math.pow(10, db / 20), 0.1);
  }

  setArpMaxNotes(n: number): void {
    this.arpMaxNotes = n;
  }

  setArpJitter(pct: number): void {
    this.arpJitterPct = pct;
  }

  setArpInstrument(instrument: ArpInstrument): void {
    this.arpInstrument = instrument;
    for (const voice of this.arps.values()) voice.dispose();
    this.arps.clear(); // voices recreate lazily with the new instrument next tick
  }

  /** Current mixer/arp settings, for world snapshots and mood bases. */
  snapshotSettings(): {
    masterDb: number;
    arpDb: number;
    arpMaxNotes: number;
    arpInstrument: ArpInstrument;
    arpJitterPct: number;
  } {
    return {
      masterDb: this.masterDb,
      arpDb: this.arpDb,
      arpMaxNotes: this.arpMaxNotes,
      arpInstrument: this.arpInstrument,
      arpJitterPct: this.arpJitterPct,
    };
  }

  handleTick(
    events: ClusterEvents,
    births: Cell[],
    population: number,
    tickSec: number,
    gridW: number,
    gridH: number,
    arpIds: ReadonlySet<number> = new Set(),
  ): void {
    if (!this.ready) return;
    const now = Tone.now();

    // 1. Birth pings (staggered, capped).
    for (const p of planPings(births)) {
      const freq = quantize(cellRadial(p.x, p.y, gridW, gridH), this.key, this.scale, PING_BASE_MIDI, 2);
      this.pingSynth.triggerAttackRelease(freq, 0.15, now + p.delayMs / 1000, p.velocity);
    }

    // 2. Pads: release the dead, allocate voices to the largest, apply metrics.
    for (const id of events.died) {
      this.pads.get(id)?.release();
      this.pads.delete(id);
      const arp = this.arps.get(id);
      if (arp) {
        this.arps.delete(id);
        setTimeout(() => arp.dispose(), 4000); // let in-flight notes ring out
      }
    }
    const active = [...events.born, ...events.updated];
    const padActive = active.filter(m => !arpIds.has(m.id));
    const arpActive = active.filter(m => arpIds.has(m.id));
    const audible = allocateVoices(
      padActive.map(m => ({ id: m.id, cellCount: m.cellCount })),
      MAX_PADS,
    );
    for (const m of padActive) {
      if (!audible.has(m.id)) {
        this.pads.get(m.id)?.mute();
        continue;
      }
      let voice = this.pads.get(m.id);
      const isNew = !voice;
      if (!voice) {
        // Lazily created, so clusters stamped while paused still get a pad.
        voice = new PadVoice(this.busIn);
        this.pads.set(m.id, voice);
      }
      const freq = quantize(m.radial, this.key, this.scale, PAD_BASE_MIDI, 2);
      voice.apply(m, freq, isNew ? 2 : Math.max(0.1, tickSec * 0.9));
    }

    const arpAudible = allocateVoices(
      arpActive.map(m => ({ id: m.id, cellCount: m.cellCount })),
      MAX_ARPS,
    );
    for (const m of arpActive) {
      if (!arpAudible.has(m.id)) continue; // over the cap: silent this tick
      let voice = this.arps.get(m.id);
      if (!voice) {
        voice = new ArpVoice(this.arpGain, this.arpInstrument);
        this.arps.set(m.id, voice);
      }
      voice.schedule(
        deriveArpeggio(m.cells, this.arpMaxNotes),
        radialToDegree(m.radial, this.scale, 2),
        this.key,
        this.scale,
        tickSec,
        now,
        this.arpJitterPct,
        m.pan,
      );
    }

    // Reconcile any pad or arp whose cluster vanished without a `died` event
    // (e.g. erased or merged away during paused edits): release true orphans.
    const livePadIds = new Set(padActive.map(m => m.id));
    for (const id of orphanedVoiceIds(this.pads.keys(), livePadIds)) {
      this.pads.get(id)?.release();
      this.pads.delete(id);
    }
    const liveArpIds = new Set(arpActive.map(m => m.id));
    for (const id of orphanedVoiceIds(this.arps.keys(), liveArpIds)) {
      const voice = this.arps.get(id)!;
      this.arps.delete(id);
      setTimeout(() => voice.dispose(), 4000);
    }

    // 3. Harmonic anchor: sounds whenever anything is alive.
    this.anchorGain.gain.rampTo(population > 0 ? 0.05 : 0, 2);

    // 4. Population ducking (limiter is the hard backstop).
    const duckDb = Math.min(12, population / 30);
    this.duckGain.gain.rampTo(Math.pow(10, -duckDb / 20), 1);
  }
}
