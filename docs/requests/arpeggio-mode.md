I'd like to be able to overlay arpeggios on top of the pads that we're currently generating.

Here's how I'd like it to behave:
* press A (or something) to toggle Arpeggio mode
* nothing currently playing changes
* just like a cluster currently defines a pad, any clusters that come into existence in arpeggio mode define an arpeggio
* the arpeggio is like a piano roll -- x position defines a note offset, y position defines time (let's play top-down). Let's only play one note at a time from the x axis, but choose it at random.
* the offset is the number of intervals from the root. Just like a pad, the root is set as the distance of the center of the cluster from the center of the screen. Let's *not* wrap notes though -- we should allow multiple octaves in an arpeggio.
* let's cap arpeggios at 16 notes, played within the space of a generation. So if our "speed" is set to one generation/second, at most we'd play 16 notes of an arpeggio in a second. But the duration of each note is defined by the y-dimensions of the cluster (I might want to tune this, let's play around with it)
* The volume of the arpeggio notes should be a little quieter than the pads.
* Let's not play exactly on beat, let's add a little jitter (like 1%?)
* We could add slider controls on the right side of the screen to control arpeggio volume, max arpeggio notes/generation, arpeggio instrument, and arpeggio jitter


