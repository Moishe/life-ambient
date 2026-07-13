# Life Ambient

Conway's Game of Life as an ambient music composer. Place known Life
patterns on a 96x96 grid; living clusters become pad voices (pitch from
distance-to-center, pan from horizontal position, warble from shape
change), and cell births become soft percussive pings. Deaths are silent.

## Run

    npm install
    npm run dev

Open the printed URL, click "tap to start audio", pick a pattern, click
the grid to place it. `R` rotates the armed pattern.

## Develop

    npm test          # unit tests (engine, tracker, scale, allocation)
    npm run typecheck
    npm run build

Manual audio verification: docs/smoke-test.md.

## Architecture

LifeEngine (pure sim) -> ClusterTracker (stable cluster identities +
metrics) -> SoundMapper (Tone.js) with a thin canvas/DOM UI on top.
Design spec: docs/superpowers/specs/2026-07-13-life-ambient-music-design.md
