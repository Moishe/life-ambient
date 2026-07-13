# Manual smoke test

Run `npm run dev`, open the URL, click "tap to start audio". Then verify:

1. **Empty board**: silence; hint text "pick a pattern, then click to place it".
2. **Birth pings**: stamp an Acorn; each generation's births produce soft
   staggered pings, never a harsh burst.
3. **Still-life drone**: clear, stamp a Block; a steady unwavering pad.
4. **Blinker warble**: stamp a Blinker; its pad pulses at period 2
   (brightness/level oscillation).
5. **Pentadecathlon**: slower, deeper cyclic warble (period 15).
6. **Glider arc**: stamp a Glider aimed across the center; pitch falls as
   it approaches center, rises after it passes; pan follows it.
7. **Gun**: stamp the Gosper gun; a stream of glider voices + pings;
   output stays controlled (limiter, ducking) after a minute.
8. **Key/scale**: while sound plays, change key and scale; pads glide to
   new pitches within one tick, no clicks or dissonant hangover.
9. **Pause-arrange**: pause, stamp several patterns (silent), press play;
   pads fade in.
10. **Clear**: all sound fades out over a few seconds; no stuck voices.
11. **Rate**: sweep speed 1-8 gen/s; pings track the new pulse.
12. **Volume**: slider attenuates smoothly; ducking still works.
13. **No stuck voices after paused edits**: while a pad is sounding, pause,
    paint over that cluster's cells to erase it, then press Clear (or play);
    the pad fades out within a few seconds — nothing drones on.
