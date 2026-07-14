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
