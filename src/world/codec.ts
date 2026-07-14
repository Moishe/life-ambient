import { KEYS, type KeyName, type ScaleName } from '../audio/scale';
import type { ArpInstrument } from '../audio/arpeggio';
import type { Cell } from '../engine/life';

// Serialization orders are pinned and append-only: reordering or removing an
// entry silently changes what old share links decode to. Append new entries at
// the end, never in the middle.
export const SCALE_ORDER: readonly ScaleName[] = [
  'majorPentatonic',
  'minorPentatonic',
  'lydian',
  'dorian',
  'wholeTone',
  'aeolian',
];
export const INSTRUMENT_ORDER: readonly ArpInstrument[] = ['pluck', 'bell', 'keys'];

export interface WorldSettings {
  rate: number; // generations/sec, integer 1..8
  key: KeyName;
  scale: ScaleName;
  masterDb: number;
  arpMode: boolean;
  arpDb: number;
  arpMaxNotes: number;
  arpInstrument: ArpInstrument;
  arpJitterPct: number;
}

export interface WorldState {
  cells: Cell[];
  settings: WorldSettings;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function packBits(bits: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  return bytes;
}

function unpackBits(bytes: Uint8Array, bitLen: number): Uint8Array {
  const bits = new Uint8Array(bitLen);
  for (let i = 0; i < bitLen; i++) {
    bits[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  }
  return bits;
}

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += B64[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += B64[b2 & 63];
  }
  return out;
}

function fromBase64Url(s: string, byteLen: number): Uint8Array | null {
  if (s.length !== Math.ceil((byteLen * 8) / 6)) return null;
  const out = new Uint8Array(byteLen);
  let buf = 0;
  let bitCount = 0;
  let oi = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buf = (buf << 6) | v;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      if (oi < byteLen) out[oi++] = (buf >> bitCount) & 0xff;
    }
  }
  return oi === byteLen ? out : null;
}

// Linear RLE over the row-major grid: `<count>b` dead, `<count>o` alive,
// trailing dead run omitted. Empty string = empty board.
function encodeRle(bits: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bits.length) {
    const v = bits[i];
    let j = i + 1;
    while (j < bits.length && bits[j] === v) j++;
    if (v === 1 || j < bits.length) out += String(j - i) + (v ? 'o' : 'b');
    i = j;
  }
  return out;
}

function decodeRle(s: string, bitLen: number): Uint8Array | null {
  const bits = new Uint8Array(bitLen);
  let pos = 0;
  const re = /(\d+)([bo])/gy; // sticky: any stray character stops the scan
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(s)) !== null) {
    const run = Number(m[1]);
    if (run === 0 || pos + run > bitLen) return null;
    if (m[2] === 'o') bits.fill(1, pos, pos + run);
    pos += run;
    consumed = re.lastIndex;
  }
  if (consumed !== s.length) return null; // malformed tail
  return bits;
}

/** Version-1 wire format, `~`-joined:
 *  1~gridW~gridH~rate~keyIdx~scaleIdx~masterDb~arp01~arpDb~maxNotes~instIdx~jitter~board
 *  board = 'r' + RLE  or  'x' + base64url raw bitmap, whichever is shorter. */
export function serializeWorld(state: WorldState, gridW: number, gridH: number): string {
  const bits = new Uint8Array(gridW * gridH);
  for (const c of state.cells) {
    if (c.x >= 0 && c.y >= 0 && c.x < gridW && c.y < gridH) bits[c.y * gridW + c.x] = 1;
  }
  const rle = 'r' + encodeRle(bits);
  const raw = 'x' + toBase64Url(packBits(bits));
  const s = state.settings;
  return [
    1,
    gridW,
    gridH,
    s.rate,
    KEYS.indexOf(s.key),
    SCALE_ORDER.indexOf(s.scale),
    s.masterDb,
    s.arpMode ? 1 : 0,
    s.arpDb,
    s.arpMaxNotes,
    INSTRUMENT_ORDER.indexOf(s.arpInstrument),
    s.arpJitterPct,
    rle.length <= raw.length ? rle : raw,
  ].join('~');
}

function parseNum(s: string): number | null {
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

function intIn(s: string, lo: number, hi: number): number | null {
  const n = parseNum(s);
  return n !== null && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

function floatIn(s: string, lo: number, hi: number): number | null {
  const n = parseNum(s);
  return n !== null && n >= lo && n <= hi ? n : null;
}

/** Defensive: share links are untrusted input. Any malformed field → null.
 *  Ranges are looser than the UI sliders on purpose (forward compatibility);
 *  cells beyond the live grid are dropped by engine.set at apply time. */
export function deserializeWorld(text: string): WorldState | null {
  const parts = text.split('~');
  if (parts.length !== 13 || parts[0] !== '1') return null;
  const gridW = intIn(parts[1], 1, 512);
  const gridH = intIn(parts[2], 1, 512);
  const rate = intIn(parts[3], 1, 8);
  const keyIdx = intIn(parts[4], 0, KEYS.length - 1);
  const scaleIdx = intIn(parts[5], 0, SCALE_ORDER.length - 1);
  const masterDb = floatIn(parts[6], -60, 0);
  const arpMode = parts[7] === '1' ? true : parts[7] === '0' ? false : null;
  const arpDb = floatIn(parts[8], -60, 0);
  const arpMaxNotes = intIn(parts[9], 1, 32);
  const instIdx = intIn(parts[10], 0, INSTRUMENT_ORDER.length - 1);
  const arpJitterPct = floatIn(parts[11], 0, 10);
  if (
    gridW === null || gridH === null || rate === null || keyIdx === null ||
    scaleIdx === null || masterDb === null || arpMode === null || arpDb === null ||
    arpMaxNotes === null || instIdx === null || arpJitterPct === null
  ) {
    return null;
  }

  const board = parts[12];
  const bitLen = gridW * gridH;
  let bits: Uint8Array | null = null;
  if (board.startsWith('r')) {
    bits = decodeRle(board.slice(1), bitLen);
  } else if (board.startsWith('x')) {
    const bytes = fromBase64Url(board.slice(1), Math.ceil(bitLen / 8));
    bits = bytes && unpackBits(bytes, bitLen);
  }
  if (!bits) return null;

  const cells: Cell[] = [];
  for (let i = 0; i < bitLen; i++) {
    if (bits[i]) cells.push({ x: i % gridW, y: Math.floor(i / gridW) });
  }
  return {
    cells,
    settings: {
      rate,
      key: KEYS[keyIdx],
      scale: SCALE_ORDER[scaleIdx],
      masterDb,
      arpMode,
      arpDb,
      arpMaxNotes,
      arpInstrument: INSTRUMENT_ORDER[instIdx],
      arpJitterPct,
    },
  };
}
