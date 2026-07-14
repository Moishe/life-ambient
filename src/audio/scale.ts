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

export function radialToDegree(radial: number, scale: ScaleName, octaves = 2): number {
  const steps = SCALES[scale];
  const degreeCount = steps.length * octaves + 1;
  const clamped = Math.max(0, Math.min(1, radial));
  return Math.round(clamped * (degreeCount - 1));
}

// degreeIndex must be >= 0; indices past one scale length keep climbing (no wrap).
// Pitches above maxMidi fold down by whole octaves (same pitch class, still in scale).
export function degreeToFreq(
  degreeIndex: number,
  key: KeyName,
  scale: ScaleName,
  baseMidi = 48,
  maxMidi = Infinity,
): number {
  const steps = SCALES[scale];
  const octave = Math.floor(degreeIndex / steps.length);
  let midi = baseMidi + KEYS.indexOf(key) + octave * 12 + steps[degreeIndex % steps.length];
  while (midi > maxMidi) midi -= 12;
  return midiToFreq(midi);
}

export function quantize(
  radial: number,
  key: KeyName,
  scale: ScaleName,
  baseMidi = 48,
  octaves = 2,
): number {
  return degreeToFreq(radialToDegree(radial, scale, octaves), key, scale, baseMidi);
}
