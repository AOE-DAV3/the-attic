# Specification — IFF ILBM decoder

## Purpose

Recover a pixel buffer from an Amiga InterLeaved BitMap — the format of the Amiga's paint and
animation software, and of most artwork that survived from that platform.

## Structure

An IFF file is `FORM` + size + `ILBM`, followed by word-aligned typed chunks. This decoder
reads `BMHD` (header), `CMAP` (palette), `CAMG` (display mode) and `BODY` (pixels), and skips
everything else.

## Requirements

**R1 — Chunk walking.** Each chunk is a 4-byte type, a big-endian 32-bit length, then the data.
Chunks are padded to an even length, and the padding byte must be skipped whether or not it is
present at the end of the file.

**R2 — Header.** `BMHD` is 20 bytes: width, height (big-endian), x/y origin, bitplane count,
masking flag, compression flag, transparent colour, aspect, page size.

**R3 — Plane geometry.** Rows are padded to a whole number of 16-bit words:
`rowBytes = ((width + 15) >> 4) << 1`. Reading `width` bytes straight out of a 16-pixel row is
the classic ILBM off-by-one and shifts every subsequent row.

**R4 — ByteRun1 is ONE continuous stream.** A run may be longer than the bytes remaining in the
current plane and must continue into the next. A decoder that treats each plane as an
independent PackBits stream desynchronises from the second plane onward and produces a
plausible-looking but wrong image. The reader therefore carries partial-run state across calls.

**R5 — Bitplane assembly.** Bit `p` of each pixel comes from plane `p`, most significant bit
leftmost. Planes are stored sequentially within each row.

**R6 — Mask plane.** When the masking flag is 1, one extra bitplane follows the colour planes.
A set bit means opaque; a clear bit means transparent.

**R7 — Extra-Half-Brite (CAMG bit 0x80, 6 planes).** Index 32–63 is index 0–31 at half
brightness, formed by shifting each channel right by one.

**R8 — HAM (CAMG bit 0x800, 6 or 8 planes).** The low two bits of the index are a control code:
0 = take the colour from the palette (index `>> 2`), 1/2/3 = modify blue/red/green of the
*current* pixel's colour to the value in the high bits. The working colour must reset at the
start of every scanline. HAM8 uses 6 data bits, HAM6 uses 4 (scaled by 17).

**R9 — Failure.** A file that is not a `FORM`, or is a `FORM` that is not `ILBM`/`PBM `, or that
lacks `BMHD` or `BODY`, must throw.

## Acceptance

`tests/run.js` decodes four fixtures: a 5-plane compressed image byte-exactly against the
palette used to build it; an Extra-Half-Brite image whose right half must be exactly half the
left half's brightness; a HAM6 image that must produce many distinct in-range colours along a
scanline; and a masked image whose unmasked edge must be transparent.
