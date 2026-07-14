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
14. **Arpeggio riffs**: press `A` (panel button lights up amber), stamp a
    Pulsar; instead of a pad it plays a cyclic riff that mutates through its
    period-3 cycle, and its cells draw hollow.
15. **Mode isolation**: with pads sounding, toggle arpeggio mode on and off;
    nothing already playing changes. New stamps follow the current mode.
16. **Arp controls**: arp volume attenuates only the riffs; max notes/gen
    audibly thins a tall pattern; each instrument sounds distinct; jitter at
    5% loosens timing, 0% locks it.

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
7. **Master volume independence:** Turn master volume way down while
   recording; the downloaded file still plays at full level (the slider
   affects monitoring only).
8. **Known caveat (not a failure):** Backgrounding the tab mid-recording
   freezes video frames (rAF throttling); audio keeps recording.

## Moods & worlds

17. **Mood apply + re-roll:** Click "Reading" (top of the palette). The
    board repopulates and the speed/key/scale controls jump to match; a calm,
    sparse soundscape plays. Click it again — a different arrangement. Verify
    the "Reading" button lights up in its amber mood highlight, and that the
    Paint/tool-palette selection highlight is unchanged.
18. **Apply while playing:** With sound playing, apply any mood. The old pads
    fade out and the new world takes over — no stuck voices.
19. **Break (arp mood):** Click "Break". The arpeggio-mode button lights
    up, clusters chime as bells, and their cells draw hollow.
20. **Save/load round-trip:** Save the current world (name it), apply "Sprinting",
    then Load the save. The exact board and settings return, and loading clears
    the mood highlight (no mood button stays lit).
21. **Share link:** Click "Share link" (button flashes "Copied!"), paste the URL
    in a new tab, and tap start: the same world plays.
22. **Apply while paused:** Pause, apply a mood. It stays silent until you press
    play, then fades in.
