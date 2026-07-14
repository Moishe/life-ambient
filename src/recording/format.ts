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
