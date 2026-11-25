# Specification — TGA decoder

## Purpose

Recover a pixel buffer from a TGA file (Truevision Targa, 1984) — the texture format behind a
generation of DOS games and 3D packages.

## Scope

In scope: uncompressed and RLE for truecolour, colour-mapped and greyscale; 8/15/16/24/32 bpp;
both row origins. Out of scope: the optional TGA 2.0 footer extensions (they are metadata we
display but do not need in order to decode pixels).

## Requirements

**R1 — Header.** 18 bytes, little-endian. Fields in order: id length, colour-map type,
image type, colour-map origin, colour-map length, colour-map entry size, x/y origin,
width, height, pixel depth, image descriptor.

**R2 — Image type dispatch.** Types 1/2/3 are uncompressed; 9/10/11 are the RLE forms of the
same three. Any other type must throw.

**R3 — RLE.** Header byte with the high bit set is a run of `(b & 0x7F) + 1` copies of the
following pixel. High bit clear is `(b & 0x7F) + 1` literal pixels. Runs never cross scanlines
in practice but the decoder must not assume alignment.

**R4 — Origin.** Bit `0x20` of the descriptor means top-down. Otherwise rows are stored
bottom-up and must be flipped. Getting this wrong yields a vertically mirrored image, which
looks plausible enough to ship by accident — so it is explicitly tested.

**R5 — Channel order.** On-disk order is B, G, R, A. Output is R, G, B, A.

**R6 — Identification.** TGA has no magic number. Sniffing uses the `TRUEVISION-XFILE` footer
when present, otherwise a plausibility check on image type, dimensions and pixel depth. Because
this is heuristic, a mis-identification must fail at decode rather than render garbage.

## Acceptance

`tests/run.js` must decode both `testcard24.tga` (uncompressed, bottom-up) and
`testcard32rle.tga` (RLE, top-down) at 32×24 with **exactly zero** channel error, and must
reject an unknown image type.
