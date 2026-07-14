# Recording Mode — Design Spec

**Date:** 2026-07-14
**Request:** `docs/requests/recording.md`
**Approach:** Real-time browser capture via MediaRecorder (approved option A)

## Summary

A record/stop button in the transport controls captures the live board
(canvas) and the live mastered audio mix into a single downloadable video
file. Recording is a real-time, WYSIWYG capture: whatever appears on the
canvas and comes out of the speakers is what lands in the file, including
pauses (held frame, fading audio) and mid-recording edits. Pressing stop
generates the file and triggers a browser download immediately.

Format preference: MP4/H.264 where the browser's MediaRecorder supports it
(Chrome 126+, Safari), otherwise WebM. No transcoding, no dependencies.

## Decisions locked during brainstorming

- **Use case:** shareable video clip (visuals + audio in one file).
- **Format:** prefer MP4 when `MediaRecorder.isTypeSupported` allows it;
  fall back to WebM. Never ship ffmpeg.wasm.
- **Pause/edit during recording:** keep rolling. No splicing, no auto-pause.
- **No hard duration cap.** The stop button shows elapsed time; chunked
  capture keeps memory proportional to clip length (~15–20 MB/min).

## Architecture

Two new files plus small additions to three existing ones. One-way flow is
preserved; Tone.js stays confined to `soundMapper.ts`.

```
controls.ts ──onRecordToggle──▶ main.ts ──start/stop──▶ recorder.ts
                                   │                        ▲   ▲
                                   │                 canvas─┘   │
                                   └─▶ soundMapper.captureStream┘
```

### `src/recording/format.ts` (new, pure)

- `pickMimeType(isSupported: (t: string) => boolean): string | null`
  Walks this preference list and returns the first supported entry, or
  `null` if none:
  1. `video/mp4;codecs=avc1.42E01E,mp4a.40.2`
  2. `video/mp4`
  3. `video/webm;codecs=vp9,opus`
  4. `video/webm;codecs=vp8,opus`
  5. `video/webm`
- `recordingFilename(mimeType: string, date: Date): string`
  → `life-ambient-YYYY-MM-DD-HHMMSS.mp4` (any `video/mp4` type) or `.webm`
  (everything else). Local time, zero-padded.
- `formatElapsed(seconds: number): string` → `M:SS` (e.g. `2:07`), for the
  stop-button label.

No browser APIs touched — `isSupported` is injected so tests pass a fake.

### `src/recording/recorder.ts` (new, owns MediaRecorder)

```ts
class Recorder {
  constructor(canvas: HTMLCanvasElement, getAudioStream: () => MediaStream)
  get isRecording(): boolean
  get elapsedSec(): number          // 0 when idle
  static supported(): boolean       // pickMimeType against real isTypeSupported
  start(): void
  stop(): Promise<{ blob: Blob; mimeType: string }>
}
```

- `start()`: builds a combined `MediaStream` from
  `canvas.captureStream(30)`'s video track plus the audio track from
  `getAudioStream()`; creates `MediaRecorder(stream, { mimeType,
  videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 })`; starts
  with a 1000 ms timeslice, accumulating chunks in an array. Records the
  start timestamp for `elapsedSec`.
- `stop()`: calls `recorder.stop()`, resolves on the `onstop` event with
  `new Blob(chunks, { type: mimeType })`. Resolves even if the chunk list
  is tiny (instant record→stop still yields a file). Resets state so the
  recorder is reusable.
- On finalize, stop only the **video** track (fresh per `start()`). The
  audio track belongs to SoundMapper's cached `MediaStreamAudioDestinationNode`
  and is reused by later recordings — stopping it would permanently kill
  audio capture.
- `onerror` on the MediaRecorder: finalize the chunks captured so far into
  a result and flip `isRecording` to false. If a `stop()` call is pending,
  it resolves with that result; otherwise the result is held and the next
  `stop()` resolves with it immediately. Main's 1 s label interval checks
  `isRecording` each tick — if it flipped false without a user stop, main
  runs the normal stop/download path, so partial recordings are delivered,
  never silently dropped.
- No Tone import. No DOM construction. The audio stream is pulled lazily at
  `start()` so the audio context is guaranteed live by then.

### `SoundMapper.captureStream(): MediaStream` (addition)

Lazily creates a `MediaStreamAudioDestinationNode` from the raw
`AudioContext` (`Tone.getContext().rawContext`), connects the existing
limiter to it **in addition to** `toDestination()`, caches it, and returns
`node.stream`. Post-limiter tap: the recording is exactly the mastered mix
(lowpass → reverb → duck → limiter). Requires `ready === true`; main
guarantees this (see gating below).

### `controls.ts` (addition)

A record button in the transport group, same pattern as the play button:

- New callback `onRecordToggle(): void` on the controls callback interface.
- `buildControls` returns (alongside existing setters) a
  `setRecordState(rec: { recording: boolean; label: string; enabled: boolean }): void`
  used by main to flip `● Rec` ⇄ `■ 2:34`, and to disable the button with a
  `title="Recording not supported in this browser"` tooltip when
  `Recorder.supported()` is false.
- The button gets a `recording` CSS class while active (red tint) so the
  armed state is visible at a glance.
- No keyboard shortcut (`R` = rotate and `A` = arp are taken; YAGNI).

### `main.ts` (wiring)

- Construct `const recorder = new Recorder(canvas, () => sound.captureStream())`.
- `onRecordToggle`:
  - If unsupported → no-op (button is disabled anyway).
  - Audio is guaranteed live: the `#gate` overlay covers the whole UI
    (`position: fixed; inset: 0`) until `Tone.start()` + `mapper.init()`
    complete, so the record button cannot be pressed before the audio
    graph exists. `captureStream()` still throws if called pre-init, as a
    defensive invariant.
  - Start: `recorder.start()`, begin a 1 s interval updating the button
    label with `■ ${formatElapsed(recorder.elapsedSec)}`.
  - Stop: clear the interval, `await recorder.stop()`, then download:
    create an object URL from the blob, click a temporary
    `<a download="${recordingFilename(mimeType, new Date())}">`, revoke the
    URL afterwards.
- Recording state does not interact with the sim loop, tracker, or arp
  registry in any way — the capture is a pure observer.

## Error handling & edge cases

- **No supported mime type** (ancient browser): button disabled with
  tooltip; `pickMimeType` returning `null` is the single source of truth.
- **MediaRecorder `onerror` mid-recording:** finalize what was captured and
  deliver the partial file; reset to idle. Never lose chunks silently.
- **Instant record→stop:** still produces a (possibly near-empty) file.
- **Backgrounded tab:** `canvas.captureStream` throttles when rAF stops;
  audio keeps recording. Documented as a known caveat in the smoke test,
  not worked around.
- **Pause mid-recording:** held frame + audio release tails, by design.
- **Page unload while recording:** recording is lost; acceptable, no
  beforeunload guard (YAGNI).

## Testing

Per project philosophy, pure logic gets Vitest; browser/Tone layers get
manual smoke checks.

- **Unit (`tests/recording-format.test.ts`, following the project's
  `tests/` convention):** mime preference order (MP4
  wins when supported; correct WebM fallback; `null` when nothing matches);
  filename extension follows mime family; filename zero-padding with a
  fixed `Date`; `formatElapsed` (0 → `0:00`, 67 → `1:07`, 600 → `10:00`).
- **Smoke test additions (`docs/smoke-test.md`):**
  1. Record button disabled tooltip never appears in Chrome/Firefox/Safari.
  2. Record while playing → stop → file downloads, plays with sound, video
     matches what was on screen.
  3. In Chrome ≥126 or Safari the file is `.mp4`; in Firefox `.webm`.
  4. Elapsed timer counts up on the button; button shows recording state.
  5. Pause mid-recording → resulting video holds the frame while audio
     fades, then resumes on play.
  6. Record → stop → record again → stop: the second file also has audio
     (the shared audio capture node survives the first recording).

## Out of scope

- Audio-only export, replay files, resolution/bitrate settings UI,
  ffmpeg.wasm transcoding, beforeunload warnings, recording indicator
  overlays on the canvas.
