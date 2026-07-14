# Recording Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A record/stop button in the transport controls that captures the live canvas + mastered audio mix into a downloadable MP4 (WebM fallback) video file.

**Architecture:** Real-time WYSIWYG capture. `canvas.captureStream(30)` supplies video; a `MediaStreamAudioDestinationNode` tapped off SoundMapper's limiter supplies the mastered audio; a `MediaRecorder` in a new `src/recording/recorder.ts` muxes them. Pure format helpers (`src/recording/format.ts`) are unit-tested; the MediaRecorder wrapper and UI are covered by manual smoke tests, per project testing philosophy.

**Tech Stack:** TypeScript (strict), Vite, Vitest, browser MediaRecorder API. Tone.js is touched ONLY inside `src/audio/soundMapper.ts`.

**Spec:** `docs/superpowers/specs/2026-07-14-recording-design.md` — read it before starting.

## Global Constraints

- `npm run typecheck` (tsc --noEmit, strict) must stay clean after every task.
- `npm test` must pass after every task.
- Only `src/audio/soundMapper.ts` and `src/main.ts` may import `tone`. The new `src/recording/*` files must NOT import Tone.
- Unit tests live in `tests/` (e.g. `tests/recording-format.test.ts`), import from `../src/...`, and use `describe`/`it`/`expect` from vitest. Do not add tests that mock Tone.js or MediaRecorder.
- Mime preference order (exact): `video/mp4;codecs=avc1.42E01E,mp4a.40.2`, `video/mp4`, `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/webm`.
- Recording bitrates: video 2_500_000 bps, audio 128_000 bps, timeslice 1000 ms, canvas capture 30 fps.
- Filename format: `life-ambient-YYYY-MM-DD-HHMMSS.mp4|.webm` (local time, zero-padded).
- Commit after every task with a conventional-commits message ending in the Claude co-author trailer.

---

### Task 1: Pure format helpers (`format.ts`) — TDD

**Files:**
- Create: `src/recording/format.ts`
- Test: `tests/recording-format.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no imports).
- Produces (used by Tasks 2 and 5):
  - `pickMimeType(isSupported: (type: string) => boolean): string | null`
  - `recordingFilename(mimeType: string, date: Date): string`
  - `formatElapsed(seconds: number): string`

- [ ] **Step 1: Write the failing test**

Create `tests/recording-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickMimeType, recordingFilename, formatElapsed } from '../src/recording/format';

describe('pickMimeType', () => {
  it('prefers full MP4 with codecs when everything is supported', () => {
    expect(pickMimeType(() => true)).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
  });

  it('falls back to bare mp4 when the codec string is rejected', () => {
    expect(pickMimeType(t => t === 'video/mp4')).toBe('video/mp4');
  });

  it('falls back to vp9 webm when mp4 is unsupported', () => {
    expect(pickMimeType(t => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9,opus');
  });

  it('falls back to vp8 webm when vp9 is unsupported', () => {
    expect(pickMimeType(t => t === 'video/webm;codecs=vp8,opus' || t === 'video/webm')).toBe(
      'video/webm;codecs=vp8,opus',
    );
  });

  it('returns null when nothing is supported', () => {
    expect(pickMimeType(() => false)).toBeNull();
  });
});

describe('recordingFilename', () => {
  const date = new Date(2026, 6, 14, 15, 30, 42); // 2026-07-14 15:30:42 local

  it('uses .mp4 for any video/mp4 mime type', () => {
    expect(recordingFilename('video/mp4;codecs=avc1.42E01E,mp4a.40.2', date)).toBe(
      'life-ambient-2026-07-14-153042.mp4',
    );
  });

  it('uses .webm for webm mime types', () => {
    expect(recordingFilename('video/webm;codecs=vp9,opus', date)).toBe(
      'life-ambient-2026-07-14-153042.webm',
    );
  });

  it('zero-pads single-digit fields', () => {
    const d = new Date(2026, 0, 5, 9, 3, 7); // 2026-01-05 09:03:07
    expect(recordingFilename('video/mp4', d)).toBe('life-ambient-2026-01-05-090307.mp4');
  });
});

describe('formatElapsed', () => {
  it('formats zero', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatElapsed(67)).toBe('1:07');
  });

  it('formats exact minutes', () => {
    expect(formatElapsed(600)).toBe('10:00');
  });

  it('floors fractional seconds and clamps negatives', () => {
    expect(formatElapsed(59.9)).toBe('0:59');
    expect(formatElapsed(-3)).toBe('0:00');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/recording-format.test.ts`
Expected: FAIL — cannot resolve `../src/recording/format`.

- [ ] **Step 3: Write the implementation**

Create `src/recording/format.ts`:

```ts
// Pure recording-format policy: mime preference, filenames, timer labels.
// No browser APIs — `isSupported` is injected so this stays unit-testable.

const MIME_PREFERENCES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** First supported entry of the MP4-first preference list, or null. */
export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  for (const type of MIME_PREFERENCES) {
    if (isSupported(type)) return type;
  }
  return null;
}

/** life-ambient-YYYY-MM-DD-HHMMSS.mp4|.webm, in local time. */
export function recordingFilename(mimeType: string, date: Date): string {
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `life-ambient-${stamp}.${ext}`;
}

/** M:SS label for the stop button, e.g. 127 → "2:07". */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run tests and typecheck to verify they pass**

Run: `npx vitest run tests/recording-format.test.ts` → all PASS.
Run: `npm run typecheck` → clean.
Run: `npm test` → all suites pass (72 existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/recording/format.ts tests/recording-format.test.ts
git commit -m "feat: recording format helpers (mime preference, filename, elapsed label)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: MediaRecorder wrapper (`recorder.ts`)

**Files:**
- Create: `src/recording/recorder.ts`

No unit tests: this file is a thin wrapper over browser-only APIs (MediaRecorder, captureStream), which the project deliberately covers with manual smoke tests instead of mocks. Keep ALL branchy logic in `format.ts`.

**Interfaces:**
- Consumes: `pickMimeType` from `./format` (Task 1).
- Produces (used by Task 5):
  - `class Recorder { constructor(canvas: HTMLCanvasElement, getAudioStream: () => MediaStream) }`
  - `Recorder.supported(): boolean` (static)
  - `get isRecording(): boolean`
  - `get elapsedSec(): number`
  - `start(): void`
  - `stop(): Promise<RecordingResult>` where `RecordingResult = { blob: Blob; mimeType: string }`

- [ ] **Step 1: Write the implementation**

Create `src/recording/recorder.ts`:

```ts
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
    if (!this.recorder) return Promise.reject(new Error('not recording'));
    return new Promise(resolve => {
      this.pendingStop = resolve;
      this.recorder!.stop();
    });
  }

  private finalize(): void {
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
  }
}
```

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck` → clean. (If `captureStream` is missing from the DOM lib types, the tsconfig `lib` needs `"DOM"` — it already has it; do NOT add `any` casts without checking first.)
Run: `npm test` → all pass (nothing imports the new file yet, but the file must compile).

- [ ] **Step 3: Commit**

```bash
git add src/recording/recorder.ts
git commit -m "feat: Recorder wrapping MediaRecorder for canvas+audio capture

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Audio tap — `SoundMapper.captureStream()`

**Files:**
- Modify: `src/audio/soundMapper.ts` (class `SoundMapper`, fields around line 139–155, methods after `setMasterVolume` around line 195)

**Interfaces:**
- Consumes: existing private `limiter` (`Tone.Limiter`, created in `init()`), existing `ready` flag.
- Produces (used by Task 5): `captureStream(): MediaStream` on `SoundMapper`.

- [ ] **Step 1: Add the field and method**

In `src/audio/soundMapper.ts`, add a private field next to the other private fields (after `private masterDb = -6;`):

```ts
  private streamDest: MediaStreamAudioDestinationNode | null = null;
```

Add this method after `setMasterVolume` (before `setArpVolume`):

```ts
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
```

Note: `Tone.getContext().rawContext` is typed as `BaseAudioContext`; the cast to `AudioContext` is safe in the app (only offline contexts lack `createMediaStreamDestination`, and the app never runs one). `Tone.Limiter.connect` accepts a native `AudioNode` destination.

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck` → clean.
Run: `npm test` → all pass (soundMapper has no unit tests; this confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add src/audio/soundMapper.ts
git commit -m "feat: SoundMapper.captureStream() audio tap off the limiter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Record button in transport controls

**Files:**
- Modify: `src/ui/controls.ts` (interface `ControlCallbacks` at lines 7–15, `buildControls` body and return value at lines 34–119)
- Modify: `src/style.css` (after the `#controls select, #controls button` rule at line 11)

**Interfaces:**
- Consumes: nothing new (DOM only — controls.ts must not import Tone or recorder modules).
- Produces (used by Task 5):
  - `onRecordToggle(): void` added to `ControlCallbacks`.
  - `setRecordState(state: { recording: boolean; label: string; enabled: boolean }): void` added to `buildControls`'s return object (alongside `setPlaying`).

- [ ] **Step 1: Add the callback to the interface**

In `src/ui/controls.ts`, add to `ControlCallbacks` after `onClear(): void;`:

```ts
  onRecordToggle(): void;
```

- [ ] **Step 2: Add the button and setter**

In `buildControls`, after the `clearBtn` block (after `controlsRoot.appendChild(clearBtn);`) and before the `hint` block, add:

```ts
  const recordBtn = document.createElement('button');
  recordBtn.textContent = '● Rec';
  recordBtn.addEventListener('click', () => cb.onRecordToggle());
  controlsRoot.appendChild(recordBtn);
```

Change the return statement to:

```ts
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
```

And update `buildControls`'s declared return type from
`{ setPlaying(playing: boolean): void }` to:

```ts
{
  setPlaying(playing: boolean): void;
  setRecordState(state: { recording: boolean; label: string; enabled: boolean }): void;
}
```

- [ ] **Step 3: Style the armed state**

In `src/style.css`, add after the `#controls select, #controls button { ... }` rule (line 11):

```css
#controls button.recording { border-color: #f7768e; color: #f7768e; }
#controls button:disabled { opacity: 0.4; cursor: not-allowed; }
```

(#f7768e is the Tokyo Night red, matching the existing #7aa2f7 blue / #e0af68 amber accents.)

- [ ] **Step 4: Verify typecheck and tests**

Run: `npm run typecheck` → clean. (main.ts does not call `setRecordState` yet — adding a method to the return object is backward-compatible.)
Run: `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/controls.ts src/style.css
git commit -m "feat: record/stop button in transport controls

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire recording in main.ts + smoke-test doc

**Files:**
- Modify: `src/main.ts` (imports at lines 1–7, controls callbacks at lines 74–104, new wiring after the `arpUi` block)
- Modify: `docs/smoke-test.md` (append a new section at the end)

**Interfaces:**
- Consumes:
  - `Recorder`, `RecordingResult` from `./recording/recorder` (Task 2): `new Recorder(canvas, () => mapper.captureStream())`, `Recorder.supported()`, `.isRecording`, `.elapsedSec`, `.start()`, `.stop(): Promise<{ blob, mimeType }>`.
  - `formatElapsed`, `recordingFilename` from `./recording/format` (Task 1).
  - `mapper.captureStream(): MediaStream` (Task 3).
  - `ui.setRecordState({ recording, label, enabled })` (Task 4); `buildControls` callbacks now require `onRecordToggle`.
- Produces: user-facing feature; nothing downstream.

- [ ] **Step 1: Add imports and recorder state**

In `src/main.ts`, add after the existing imports (line 7):

```ts
import { Recorder } from './recording/recorder';
import { formatElapsed, recordingFilename } from './recording/format';
```

After `renderer.setArpIds(arpIds);` (line 29) and the `let` state block, add alongside the other module state (after `let repeatId: number | null = null;`):

```ts
const recorder = new Recorder(canvas, () => mapper.captureStream());
let recordTimer: number | null = null;
```

- [ ] **Step 2: Add the record helpers**

Add these functions after the `refresh` function (line 72) and before `buildControls`:

```ts
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
```

Note: these reference `ui`, which is declared below via `const ui = buildControls(...)`. That is fine — they only run from user events long after module evaluation. Do NOT reorder the file.

- [ ] **Step 3: Add the callback and initial button state**

Inside the `buildControls` callback object, after `onClear() { ... },`:

```ts
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
```

Immediately after the `const ui = buildControls(...)` statement completes (before `const arpUi = ...`), add:

```ts
setIdleRecordUi();
```

- [ ] **Step 4: Verify typecheck, tests, and build**

Run: `npm run typecheck` → clean.
Run: `npm test` → all pass.
Run: `npm run build` → succeeds. (If it fails with `Cannot find module @rollup/rollup-linux-arm64-gnu`, run `rm -rf node_modules && npm install` and retry — known npm optional-deps bug.)

- [ ] **Step 5: Append smoke-test checks**

Append to `docs/smoke-test.md` (keep the existing numbering style of the file — if items are numbered, continue the sequence; the section heading matters more than exact numbers):

```markdown
## Recording

1. **Support:** In Chrome, Firefox, and Safari the `● Rec` button is enabled (no
   "not supported" tooltip).
2. **Basic capture:** With patterns playing, press `● Rec`, wait ~15 s, press
   `■`. A file downloads; it plays back with sound, and the video matches what
   was on screen.
3. **Format:** In Chrome ≥126 or Safari the file is `.mp4`; in Firefox `.webm`.
4. **Timer:** While recording, the button shows `■ 0:01`, `■ 0:02`, … counting
   up, tinted red.
5. **Pause mid-recording:** Pause the sim while recording, wait a few seconds,
   resume, stop. The video holds the frame while the audio tails fade, then
   resumes — no splice.
6. **Reusable:** Record → stop → record again → stop. The second file also has
   audio (the shared audio-capture node survives the first recording).
7. **Known caveat (not a failure):** Backgrounding the tab mid-recording
   freezes video frames (rAF throttling); audio keeps recording.
```

- [ ] **Step 6: Commit**

```bash
git add src/main.ts docs/smoke-test.md
git commit -m "feat: wire recording capture, download, and smoke checks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
