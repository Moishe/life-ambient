export const SCALES = {
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const;

export type ScaleName = keyof typeof SCALES;

export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export type KeyName = (typeof KEYS)[number];

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function quantize(
  radial: number,
  key: KeyName,
  scale: ScaleName,
  baseMidi = 48,
  octaves = 2,
): number {
  const steps = SCALES[scale];
  const degreeCount = steps.length * octaves + 1;
  const clamped = Math.max(0, Math.min(1, radial));
  const index = Math.round(clamped * (degreeCount - 1));
  const octave = Math.floor(index / steps.length);
  const midi = baseMidi + KEYS.indexOf(key) + octave * 12 + steps[index % steps.length];
  return midiToFreq(midi);
}
