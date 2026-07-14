import { pickMimeType } from './format';

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
}

/**
 * Real-time capture of the board canvas + mastered audio mix.
 * Owns all MediaRecorder state; no Tone.js, no DOM construction.
 * Reusable: stop() fully resets, so one instance serves the whole session.
 */
export class Recorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = '';
  private startedAt = 0;
  private pendingStop: ((r: RecordingResult) => void) | null = null;
  // Set when the recorder dies via onerror with no stop() pending; the next
  // stop() call collects it so partial recordings are never dropped.
  private finished: RecordingResult | null = null;
  // Caches the in-flight stop() promise so concurrent callers (e.g. a
  // double-clicked stop button) all resolve together instead of the second
  // call's synchronous InvalidStateError orphaning the first caller.
  private stopping: Promise<RecordingResult> | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private getAudioStream: () => MediaStream,
  ) {}

  static supported(): boolean {
    return (
      typeof MediaRecorder !== 'undefined' &&
      pickMimeType(t => MediaRecorder.isTypeSupported(t)) !== null
    );
  }

  get isRecording(): boolean {
    return this.recorder !== null;
  }

  get elapsedSec(): number {
    return this.recorder ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  start(): void {
    if (this.recorder) return;
    const mimeType = pickMimeType(t => MediaRecorder.isTypeSupported(t));
    if (!mimeType) throw new Error('recording is not supported in this browser');
    this.mimeType = mimeType;
    this.chunks = [];
    this.finished = null;
    this.stopping = null;

    const stream = new MediaStream([
      ...this.canvas.captureStream(30).getVideoTracks(),
      ...this.getAudioStream().getAudioTracks(),
    ]);
    this.recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    });
    this.recorder.ondataavailable = e => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this.finalize();
    this.recorder.onerror = () => {
      try {
        this.recorder?.stop(); // triggers onstop → finalize
      } catch {
        this.finalize(); // already inactive: finalize what we have
      }
    };
    this.recorder.start(1000);
    this.startedAt = performance.now();
  }

  stop(): Promise<RecordingResult> {
    if (this.finished) {
      const result = this.finished;
      this.finished = null;
      return Promise.resolve(result);
    }
    if (this.stopping) return this.stopping;
    if (!this.recorder) return Promise.reject(new Error('not recording'));
    this.stopping = new Promise(resolve => {
      this.pendingStop = resolve;
      this.recorder!.stop();
    });
    return this.stopping;
  }

  private finalize(): void {
    if (!this.recorder) return;
    const result: RecordingResult = {
      blob: new Blob(this.chunks, { type: this.mimeType }),
      mimeType: this.mimeType,
    };
    // Stop ONLY video tracks: the canvas capture track is fresh per start(),
    // but the audio track belongs to SoundMapper's cached stream destination
    // and must survive for the next recording.
    for (const track of this.recorder?.stream.getVideoTracks() ?? []) track.stop();
    this.recorder = null;
    this.chunks = [];
    if (this.pendingStop) {
      this.pendingStop(result);
      this.pendingStop = null;
    } else {
      this.finished = result;
    }
    this.stopping = null;
  }
}
