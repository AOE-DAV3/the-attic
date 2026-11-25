# The Attic

**Open the files modern software refuses — in your browser, without uploading them anywhere.**

Every old format outlives the program that made it. A `PCX` from a 1994 scanner. A `TGA` from
a DOS game or a 3D modelling package. Modern software looks at these and shrugs. Meanwhile
every existing converter is paid, locked to one operating system, or asks you to upload your
archive to somebody else's server.

The Attic is a single static page that identifies a file **from its bytes rather than its
extension**, decodes it locally, shows it, and rescues it to PNG.

> Built for **Kiroween 2026** — Resurrection category.

---

## Why this is a resurrection

Digital preservation fails quietly. The files survive; the software does not. A scanner from
1996 still produces readable data. The machine that could open it was thrown away in 2009.

The resurrection here is not a costume over a dead brand. It is the recovery of the *decoding
rules* — the exact byte layouts of formats whose documentation is a scanned manual and whose
reference implementations are DOS binaries. `PCX` (ZSoft Paintbrush, 1985), `TGA` (Truevision Targa, 1984) and `IFF ILBM` (Electronic Arts,
1985) are specified in `.kiro/specs/`, implemented as pure functions, and proven against fixtures
generated from those specifications.

## The privacy claim

There is no upload. Not as a policy — as an enforced property of the code.

- No `fetch`, no `XMLHttpRequest`, no `WebSocket`, no `sendBeacon` in any shipped file.
  (`scripts/check.mjs` fails the build if one appears.)
- No external asset: no CDN font, no remote image, no analytics.
- It runs from `file://`. You can disconnect the network and it still works.

You can verify that yourself before dropping a sensitive scan into it. That is the point —
a converter for personal archives should not require trust.

## What it does today

| Format | Year | Variants handled |
|---|---|---|
| **PCX** — ZSoft Paintbrush | 1985 | 8-bit paletted (VGA palette), 8-bit 3-plane truecolour, 4-plane 1-bit, 1-bit mono |
| **TGA** — Truevision Targa | 1984 | uncompressed and RLE, for truecolour / colour-mapped / greyscale, 8–32 bpp, both row origins |
| **IFF ILBM** — Amiga InterLeaved BitMap | 1985 | 1–8 bitplanes, ByteRun1 compression, palette, mask plane, plus **HAM6/HAM8** and **Extra-Half-Brite** display modes |
| **IFF ANIM** — Amiga CEL animations | 1985 | keyframe + delta chain, **method 5** byte-vertical delta, ANHD timing → plays in the viewer |

Identification recognises PCX, TGA, ILBM, PNG, JPEG, GIF, BMP, Amiga MOD and WAV from content.
Formats it can name but not yet decode say so explicitly rather than rendering a blank canvas.

## Run it

```
open index.html          # that is the whole instruction
```

No build step. No dependencies. No server required for the app itself.

To deploy: push the folder to a public repository and enable GitHub Pages on `main` / root.

To run the checks:

```
node tests/run.js        # decoder conformance — 7 assertions
node scripts/check.mjs   # ship gate, including the privacy gate
```

## How it is built

```
index.html              the page
css/attic.css           an attic at night — dust, candle-light, ledger type
js/decoders/pcx.js      pure function: bytes -> RGBA
js/decoders/tga.js      pure function: bytes -> RGBA
js/sniff.js             content-based identification with confidence scores
js/app.js               the only file that touches the DOM
tools/make-fixtures.js  generates spec-compliant test files
tools/make-anim-fixture.js  encodes an ANIM with an independent method-5 encoder
tests/run.js            conformance tests
.kiro/specs/            the format specifications the decoders implement
.kiro/hooks/            run the tests on save; run the gate before commit
```

Decoders never touch the DOM. They take a `Uint8Array` and return
`{ width, height, rgba, meta }`, or throw with a readable message. That separation is what makes
them testable in plain Node with no browser and no canvas.

## Design decisions worth defending

**Trust the bytes, not the filename.** Files are routinely mislabelled — renamed by a program
that guessed, or by a user in a hurry. The viewer compares what the extension claims against
what the content proves, and says so on screen. A test drops a TGA named `.PCX` and expects the
TGA decoder to win.

**Fail loudly.** A decoder that cannot parse a file throws. Returning a blank canvas is worse
than an error, because the user cannot tell corruption from an empty image — and with a
35-year-old file, that distinction is the whole game.

**The `0xC0` rule.** In PCX, a literal byte with its top two bits set would be misread as a
run-length header. Such bytes must be written as a one-byte run. Getting this wrong corrupts
any image containing high palette indices, and it is the most common PCX bug in the wild. It is
documented in the spec, handled in the decoder, and covered by the fixture generator.

**State the lossiness.** The JPEG export says out loud that it is lossy. A rescue tool that
silently degrades the thing you are trying to save has failed at its only job.

**Two encoders, one decoder, and how the blame moved.** The ANIM decoder looked broken: frame 0
decoded exactly, then every delta frame came out wrong. The natural assumption is that the delta
decoder is at fault. It was not. The first test encoder wrote each column's op list without a
per-column op count; the second wrote the *byte* length where the format wants the *op* count
(so `uniq 25` counted as 25 ops instead of 1). Both bugs made a correct decoder look wrong.

The lesson worth keeping: when a decoder disagrees with a fixture, the fixture is a suspect too.
Writing the encoder from the specification, independently, is what made the disagreement
debuggable — and the decoder needed no changes at all once the encoder was correct.

**The ILBM bug worth reading about.** In IFF, a PackBits run may be longer than the bytes left
in the current bitplane and must continue into the next one — the `BODY` is a single continuous
stream. The first version of this decoder gave each plane its own reader, which consumed only
the bytes it needed and left the rest of the run unread. From the second plane onward every
control byte was misread, and the result was a *plausible* image that was quietly wrong. It was
caught because the tests compared against a fixture built independently from the specification.
The fix is a `StreamReader` that carries partial-run state across calls. Spec: `R4`.

## Roadmap

- ANIM delta methods 7 and 8 (short/long vertical delta)
- Video export so a rescued animation can be saved as a file, not just played
- Amiga MOD playback via WebAudio
- ICO, XBM, PICT
- Batch mode: drop a folder, rescue everything recognisable
- Batch mode: drop a folder, rescue everything recognisable, report what could not be saved

## License

MIT — see [LICENSE](LICENSE).
