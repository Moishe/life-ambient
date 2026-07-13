export interface PingPlan {
  x: number;
  y: number;
  delayMs: number;
  velocity: number;
}

export function planPings(
  births: { x: number; y: number }[],
  maxPings = 12,
  spreadMs = 80,
): PingPlan[] {
  if (births.length === 0) return [];
  const overflow = births.length > maxPings;
  let chosen = births;
  if (overflow) {
    const step = (births.length - 1) / (maxPings - 1);
    chosen = Array.from({ length: maxPings }, (_, i) => births[Math.round(i * step)]);
  }
  const n = chosen.length;
  return chosen.map((b, i) => ({
    x: b.x,
    y: b.y,
    delayMs: n === 1 ? 0 : (i / (n - 1)) * spreadMs,
    velocity: overflow && i === 0 ? 0.5 : 0.25,
  }));
}

export function allocateVoices(
  clusters: { id: number; cellCount: number }[],
  maxVoices = 16,
): Set<number> {
  return new Set(
    [...clusters]
      .sort((a, b) => b.cellCount - a.cellCount)
      .slice(0, maxVoices)
      .map(c => c.id),
  );
}
