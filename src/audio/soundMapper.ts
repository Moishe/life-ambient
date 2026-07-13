import * as Tone from 'tone';
import type { Cell } from '../engine/life';
import type { ClusterEvents, ClusterMetrics } from '../tracker/cluster';
import { cellRadial } from '../geometry';
import { KEYS, midiToFreq, quantize, type KeyName, type ScaleName } from './scale';
import { allocateVoices, planPings } from './allocation';

const PAD_BASE_MIDI = 48; // C3
const PING_BASE_MIDI = 72; // C5, two octaves above the pad register
const MAX_PADS = 16;

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
  private ready = false;

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
    Tone.getDestination().volume.rampTo(db, 0.1);
  }

  handleTick(
    events: ClusterEvents,
    births: Cell[],
    population: number,
    tickSec: number,
    gridW: number,
    gridH: number,
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
    }
    const active = [...events.born, ...events.updated];
    const audible = allocateVoices(
      active.map(m => ({ id: m.id, cellCount: m.cellCount })),
      MAX_PADS,
    );
    for (const m of active) {
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

    // 3. Harmonic anchor: sounds whenever anything is alive.
    this.anchorGain.gain.rampTo(population > 0 ? 0.05 : 0, 2);

    // 4. Population ducking (limiter is the hard backstop).
    const duckDb = Math.min(12, population / 30);
    this.duckGain.gain.rampTo(Math.pow(10, -duckDb / 20), 1);
  }
}
