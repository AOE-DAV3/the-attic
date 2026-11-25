# Specification — IFF ANIM decoder

## Purpose

Play an Amiga CEL animation: a keyframe followed by a chain of delta frames, decoded in the
browser with no dependencies.

## Structure

```
FORM ANIM
  FORM ILBM     frame 0 — BMHD, CMAP, BODY (a normal image)
  FORM ILBM     frame 1 — ANHD, [CMAP], DLTA
  FORM ILBM     frame 2 — ANHD, [CMAP], DLTA
  ...
```

## Requirements

**R1 — Nested FORMs.** The top level is `FORM ANIM`; every frame is a nested `FORM ILBM`. Each
nested form must be walked with its own chunk loop and its own size field.

**R2 — Keyframe.** Frame 0 is decoded exactly as a still ILBM: ByteRun1 `BODY` if
`BMHD.compression` is 1, else raw.

**R3 — Sixteen pointers, not eight.** A method-5 `DLTA` begins with sixteen big-endian long
pointers. The first eight address the opcode streams for up to eight bitplanes; the second eight
are unused but present. Reading only eight desynchronises every subsequent pointer.

**R4 — Byte-vertical columns.** A bitplane is a grid of columns one byte wide and `height` rows
tall. Each column starts with an op count. Zero means the column is unchanged; otherwise exactly
that many ops follow.

**R5 — The op count counts OPERATIONS.** `uniq` with n data bytes is ONE operation followed by n
bytes. A decoder reading the count as a byte length will run past the end of the column. (This
was a real bug in the reference encoder used to build the fixtures, not in the decoder.)

**R6 — Three op classes.**
- skip: byte with high bit clear, non-zero — advance that many **rows**
- uniq: `0x80 | n`, followed by n literal bytes copied down the column
- same: `0`, count, value — repeat value for count rows

**R7 — Rows, not bytes.** The destination advances by `rowBytes` (the 16-bit aligned scanline
length) per row. Advancing by one byte is the single most common way to get this decoder wrong.

**R8 — Timing.** `ANHD.reltime` at offset 12 is the delay in jiffies (1/60 s) before this frame.
Zero is treated as one jiffy.

**R9 — Palette updates.** A `CMAP` in a delta frame replaces the working palette from that frame
onward.

**R10 — Unsupported methods fail loudly.** Ops other than 0 (keyframe) and 5 (byte vertical)
throw, naming the method. Silently rendering the previous frame would present corruption as a
valid image.

## Acceptance

`tests/run.js` decodes an 8-frame method-5 animation and requires **every delta frame to be
byte-exact** against frames computed independently from the source description. It also checks
that total duration comes from the ANHD timings (0.8 s for 8 frames × 6 jiffies) and that a
non-ANIM file is rejected.
