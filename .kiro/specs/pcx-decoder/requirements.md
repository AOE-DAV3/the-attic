# Specification — PCX decoder

## Purpose

Recover a pixel buffer from a PCX file (ZSoft Paintbrush, 1985) so the viewer can display it
and the exporter can rescue it to PNG.

## Scope

In scope: 8-bit single-plane paletted, 8-bit three-plane truecolour, 1-bit four-plane CMYK-ish,
and 1-bit single-plane monochrome. Out of scope: PCX version 0 devices, and 2/4-bpp paletted
variants (rare; add only if a real file demands it).

## Inputs

- `bytes: Uint8Array` — the whole file.

## Outputs

- `{ width, height, rgba: Uint8ClampedArray, meta }` on success.
- An `Error` with a human-readable message on failure.

## Requirements

**R1 — Header parsing.** The 128-byte header is little-endian. Dimensions are
`max - min + 1` on both axes, not stored widths.

**R2 — Validity.** The first byte must be `0x0A`. Dimensions must be positive and sane
(≤ 8192 on a side). Encoding must be 1. A file failing these must throw, never render.

**R3 — Run-length decoding.** A byte with its top two bits set (`0xC0` mask) is a run header:
the low six bits give the count, the next byte gives the value. Every scanline is decoded
independently and must be padded to `bytesPerLine * planes`.

**R4 — The `0xC0` literal rule.** A literal value ≥ `0xC0` must itself be encoded as a
one-byte run. A decoder that does not handle this corrupts any image containing high palette
indices — this is the most common PCX bug in the wild.

**R5 — Palette.** For 8bpp single-plane files, a 256-colour VGA palette sits in the final 769
bytes behind a `0x0C` sentinel. If the sentinel is absent, fall back to a greyscale ramp rather
than failing.

**R6 — Plane interpretation.** 3 planes × 8bpp is R,G,B in that order. 4 planes × 1bpp packs
one bit per plane with the most significant bit leftmost.

**R7 — Output.** `rgba` is `width * height * 4` bytes, alpha always 255 (PCX has no alpha).

## Acceptance

`tests/run.js` must decode `fixtures/testcard.pcx` at 32×24 with a maximum channel error ≤ 40
(the quantisation inherent in palette mapping), and must throw on non-PCX input.
