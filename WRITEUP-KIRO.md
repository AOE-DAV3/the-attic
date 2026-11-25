# How Kiro was used — The Attic

> **Status of this document.** Sections 1–4 describe the repository as it exists and can be
> checked against the code today. Section 5 lists the Kiro-session details that must be filled
> in from real sessions before submission — they are marked `⟨TO FILL⟩` and must not be
> guessed at. See "Honesty note" at the end.

**Project:** The Attic — a local rescue tool for dead image and animation formats
**Category:** Resurrection
**Repo:** ⟨repository URL⟩
**App:** ⟨deployed URL⟩

---

## 1. The problem, and why it is a resurrection

Adobe switched Flash off in January 2021 and a generation of browser content stopped running.
That is the famous case. The quieter one is the same failure happening continuously across every
format ever written to a disk: **the files survive, the software does not.**

A scanner in 1996 wrote PCX. A DOS game shipped TGA. Amiga paint software wrote IFF ILBM and
IFF ANIM. The data in all of those files is intact and perfectly recoverable. What is missing is
the thing that knew how to read it.

Most converters that exist for these formats are paid, tied to one operating system, or require
uploading your archive to somebody else's server — which is exactly what you should not do with
the only copy of a family photograph.

The Attic reads four dead formats in the browser, identifies them from their **bytes rather than
their filename**, and rescues them to PNG. There is no upload. That is not a policy statement; it
is enforced by the build (see §3.4).

The resurrection here is the decoding rules themselves: byte layouts whose documentation is a
scanned manual and whose reference implementations are DOS and 68000 binaries.

---

## 2. What is in the repository

| Path | What it is |
|---|---|
| `js/decoders/pcx.js` | PCX (ZSoft Paintbrush, 1985) — 101 lines |
| `js/decoders/tga.js` | TGA (Truevision Targa, 1984) — 152 lines |
| `js/decoders/ilbm.js` | IFF ILBM (Amiga, 1985) incl. HAM6/HAM8, Extra-Half-Brite, masking — 241 lines |
| `js/decoders/anim.js` | IFF ANIM (Amiga CEL animations, 1985), method 5 delta — 295 lines |
| `js/sniff.js` | Content-based identification with confidence scores |
| `js/app.js` | The only file that touches the DOM |
| `tests/run.js` | 18 conformance assertions, plain Node, no framework |
| `tools/make-*.js` | Independent fixture encoders, written from the specifications |
| `scripts/check.mjs` | Ship gate, including a mechanical privacy check |
| `.kiro/specs/*/requirements.md` | One specification per decoder |
| `.kiro/steering/product.md` | Product-wide constraints |
| `.kiro/hooks/*.json` | Save-time test hook, commit-time gate hook |

Decoders are pure functions: `Uint8Array` in, `{ width, height, rgba, meta }` out, or a thrown
error with a readable message. They never touch the DOM and are tested in plain Node with no
browser and no canvas. That separation is what made the test suite possible.

---

## 3. How the development actually worked

### 3.1 Spec first, decoder second

Each format has a specification in `.kiro/specs/` written in requirement form before the decoder
was implemented: what the header contains, what must throw, and which edge cases are
load-bearing. The specifications are not documentation written afterwards — several of them
contain the requirement that later caught a real bug.

The clearest example is `ilbm-decoder/requirements.md`, **R4**:

> **R4 — ByteRun1 is ONE continuous stream.** A run may be longer than the bytes remaining in the
> current plane and must continue into the next. A decoder that treats each plane as an
> independent PackBits stream desynchronises from the second plane onward and produces a
> plausible-looking but wrong image.

That requirement exists because the first implementation made exactly that mistake.

### 3.2 Fixtures written from the specification, not from the decoder

Every decoder is tested against files produced by a separate encoder written from the
specification. `tools/make-anim-fixture.js` contains an independent method-5 ANIM *encoder*,
including the column-op run-length logic. This matters because a test that uses the same code to
produce and consume data proves only that the code is self-consistent.

### 3.3 The bug that justifies the whole method

The ANIM decoder initially looked broken. Frame 0 decoded byte-exactly; every delta frame
after it was wrong. The natural reading is "the delta decoder has a bug."

It did not. Two separate defects were in the **test encoder**:

1. It concatenated all columns of a bitplane and then wrote a single operation count, where the
   format stores one op count per column.
2. It wrote the **byte** length where the format requires the **operation** count. `uniq 25` is
   one operation followed by twenty-five data bytes; the encoder counted it as twenty-five
   operations.

Both defects made a correct decoder produce a corrupt frame. Both were found by comparing against
the specification rather than against intuition. **The decoder needed no changes at all once the
encoder was correct.**

The related ILBM bug is documented in `README.md`: in IFF a PackBits run can span plane
boundaries, and a decoder that consumes only the bytes it needs silently desynchronises from the
second plane onward — again producing an image that looks plausible and is wrong.

### 3.4 Steering as an enforced constraint

`.kiro/steering/product.md` states the non-negotiable rules. The most important is that nothing
leaves the machine. Rather than relying on discipline, the rule is checked mechanically in
`scripts/check.mjs`, which greps the shipped files for `fetch`, `XMLHttpRequest`, `WebSocket`,
`sendBeacon` and `new Image()` and fails the build. It also fails if `.kiro` is ever added to
`.gitignore`, and it re-runs the full decoder suite.

The gate has caught real regressions during development, including two separate instances of
third-party product names reaching user-visible copy — which is a submission requirement, not a
style preference.

### 3.5 The failed-first-second-time pattern

Three times during this build, a decoder failed a test and the decoder was not at fault:

| Symptom | Actual cause |
|---|---|
| PCX colours wrong at high indices | Fixture encoder emitted raw bytes ≥ 0xC0 instead of one-byte runs |
| ILBM frames shifted after plane 0 | Fixture encoder merged runs across plane boundaries (correct) while the decoder did not consume them |
| ANIM deltas corrupt | Fixture encoder wrote byte counts instead of op counts |

Keeping the fixtures independent is what made each of these diagnosable. A shared encoder would
have hidden all three.

### 3.6 Agent hooks

Two hooks live in `.kiro/hooks/`:

- **`decoder-tests.json`** — on editing any decoder, fixture generator or the test file, run
  `node tests/run.js`. Binary parsers fail in ways that look fine until a real file arrives, so
  the suite runs at the keystroke rather than at the end.
- **`ship-gate.json`** — before a shell command, run `node scripts/check.mjs`.

⟨TO FILL: did these fire during your sessions, and what did they catch? A concrete example —
"the save hook caught X before I ran the build" — is worth more than any description of the
configuration.⟩

---

## 4. What is verified, and what is not

Verified by `node tests/run.js` (18 assertions) and by an end-to-end browser pass:

- PCX 8-bit paletted decode — byte-exact against the palette used to build the fixture
- TGA 24-bit uncompressed and 32-bit RLE — **exactly zero** channel error, both row origins
- IFF ILBM 5-plane compressed — byte-exact
- IFF ILBM Extra-Half-Brite — right half exactly half the brightness of the left
- IFF ILBM HAM6 — 62 distinct colours along one scanline from a 16-entry palette
- IFF ILBM mask plane — outside the mask is transparent
- IFF ANIM method 5 — **all 8 delta frames byte-exact**, duration read from ANHD (`0.8 s`)
- Eight real files through the UI: all rescued clean, zero console errors, **zero outbound
  network requests**

Not claimed:

- **ANIM delta methods 7 and 8** are not implemented. They throw and name the method rather than
  displaying the previous frame.
- **HAM8** has a code path but no fixture, so it is not asserted to work.
- **Animation export** saves the current frame as PNG. Video export is not built, and the UI says
  so when you export.

---

## 5. Kiro-specific detail

⟨TO FILL from real sessions. The submission asks specifically about the following, and generic
answers score badly:⟩

- **Which Kiro surfaces** were used — IDE, CLI, Web, Crew — and how they differed in practice.
- **Custom agents:** did you define any, and what did they change about your workflow?
- **Spec-driven development:** how did you structure a spec for Kiro to implement? Which parts of
  a decoder spec did you write yourself versus have Kiro draft, and how did that compare with
  vibe-coding the same component?
- **Steering:** which steering rule changed Kiro's output most? (There is a good candidate here:
  the "fail loudly, never return a blank canvas" rule in `.kiro/steering/product.md`.)
- **Hooks:** see §3.6.
- **MCP:** any servers used.
- **What Kiro got wrong**, and how you caught it. This is the most convincing section you can
  write and the one most entrants omit.

---

## Honesty note

The repository is written so that a Kiro session can take it over cleanly: every decoder has a
specification with numbered requirements, every requirement has a test, and both hooks run
unattended. That is deliberate.

But this document must describe work that actually happened in Kiro. Judges are asked to
understand *how effectively you used Kiro*, and the repo will be read alongside the write-up. Fill
§5 from real sessions, delete any claim that is not true, and if a section has no honest content,
cut the section rather than pad it. A short write-up with three true, specific observations beats
a long one with borrowed language.
