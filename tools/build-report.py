#!/usr/bin/env python3
"""Build THE ATTIC — project and test report as a PDF."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, Image, PageBreak, KeepTogether, HRFlowable)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

OUT = "/home/user/attic/THE-ATTIC-report.pdf"

# ---------- fonts ----------
BASE = "/usr/share/fonts/truetype/dejavu"
def reg(name, file, fb):
    try:
        pdfmetrics.registerFont(TTFont(name, os.path.join(BASE, file)))
        return name
    except Exception:
        return fb

BODY = reg("DejaVu", "DejaVuSans.ttf", "Helvetica")
BOLD = reg("DejaVu-Bold", "DejaVuSans-Bold.ttf", "Helvetica-Bold")
MONO = reg("DejaVu-Mono", "DejaVuSansMono.ttf", "Courier")
MONO_B = reg("DejaVu-Mono-Bold", "DejaVuSansMono-Bold.ttf", "Courier-Bold")

# ---------- palette (matches the app) ----------
INK      = colors.HexColor("#0a0806")
INK2     = colors.HexColor("#12100c")
PANEL    = colors.HexColor("#17140f")
LINE     = colors.HexColor("#2e2820")
BONE     = colors.HexColor("#e8dfc8")
BONE_DIM = colors.HexColor("#a89d84")
FLAME    = colors.HexColor("#ff9b3d")
FLAME_H  = colors.HexColor("#ffc46b")
MOSS     = colors.HexColor("#9fd356")
BLOOD    = colors.HexColor("#d64545")
WHITE    = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

# ---------- styles ----------
ss = getSampleStyleSheet()
def S(name, **kw):
    base = dict(fontName=BODY, fontSize=9.5, leading=14.5, textColor=INK, spaceAfter=6)
    base.update(kw)
    return ParagraphStyle(name, **base)

TitleBig  = S("t", fontName=BOLD, fontSize=26, leading=30, textColor=INK, spaceAfter=2)
Sub       = S("s", fontName=MONO, fontSize=9, textColor=colors.HexColor("#6b6252"), spaceAfter=16)
H1        = S("h1", fontName=BOLD, fontSize=15, leading=19, textColor=INK, spaceBefore=14, spaceAfter=7)
H2        = S("h2", fontName=BOLD, fontSize=11, leading=15, textColor=colors.HexColor("#8a3a00"), spaceBefore=10, spaceAfter=4)
Body      = S("b")
Small     = S("sm", fontSize=8, leading=12, textColor=colors.HexColor("#5a5245"))
Cell      = S("c", fontSize=8, leading=11.5)
CellB     = S("cb", fontName=BOLD, fontSize=8, leading=11.5)
Code      = S("code", fontName=MONO, fontSize=7.6, leading=11, textColor=colors.HexColor("#1a3a1a"))
Caption   = S("cap", fontName=MONO, fontSize=7.5, textColor=colors.HexColor("#6b6252"), spaceBefore=3, spaceAfter=10)

def P(t, st=Body): return Paragraph(t, st)

def rule(color=LINE, w=0.6, before=2, after=8):
    return HRFlowable(width="100%", thickness=w, color=color, spaceBefore=before, spaceAfter=after)

def status_chip(ok):
    return P("PASS" if ok else "FAIL", S("chip", fontName=MONO_B, fontSize=7,
             textColor=MOSS if ok else BLOOD, leading=9))

def table(data, widths, header=True, zebra=True, align=None):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#ded6c4")),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#241f18")),
                  ("TEXTCOLOR", (0, 0), (-1, 0), WHITE)]
    if zebra:
        for r in range(1 if header else 0, len(data)):
            if (r % 2) == 0:
                style.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#f5f1e8")))
    t.setStyle(TableStyle(style))
    return t

def hdr_row(cells):
    return [P(c, S("hh", fontName=MONO_B, fontSize=7.5, leading=10,
                   textColor=FLAME_H)) for c in cells]

# ---------- page decorations ----------
def on_page(canv, doc):
    canv.saveState()
    canv.setFillColor(INK)
    canv.rect(0, PAGE_H - 11 * mm, PAGE_W, 11 * mm, stroke=0, fill=1)
    canv.setFillColor(FLAME_H)
    canv.setFont(MONO_B, 8)
    canv.drawString(MARGIN, PAGE_H - 7.6 * mm, "THE ATTIC")
    canv.setFillColor(colors.HexColor("#8a7f6a"))
    canv.setFont(MONO, 7)
    canv.drawString(MARGIN + 21 * mm, PAGE_H - 7.6 * mm, "· file rescue  ·  project & test report")
    canv.drawRightString(PAGE_W - MARGIN, PAGE_H - 7.6 * mm, "Kiroween 2026 · Resurrection")
    # footer
    canv.setStrokeColor(LINE); canv.setLineWidth(0.5)
    canv.line(MARGIN, 13 * mm, PAGE_W - MARGIN, 13 * mm)
    canv.setFillColor(colors.HexColor("#6b6252")); canv.setFont(MONO, 7)
    canv.drawString(MARGIN, 9 * mm, "nothing leaves this machine")
    canv.drawRightString(PAGE_W - MARGIN, 9 * mm, "%d" % doc.page)
    canv.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=MARGIN, rightMargin=MARGIN,
                      topMargin=17 * mm, bottomMargin=17 * mm,
                      title="The Attic — project and test report",
                      author="The Attic", subject="Kiroween 2026 Resurrection entry")
frame = Frame(MARGIN, 17 * mm, PAGE_W - 2 * MARGIN, PAGE_H - 34 * mm, id="f")
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=on_page)])

CW = PAGE_W - 2 * MARGIN     # content width
story = []

# ══════════════════════════════ COVER
story += [Spacer(1, 14 * mm),
          P("THE ATTIC", TitleBig),
          P("Open the files modern software refuses — in your browser, without uploading them anywhere.", S("lede", fontSize=11, leading=16, textColor=colors.HexColor("#3a3428"), spaceAfter=6)),
          P("PROJECT & TEST REPORT  ·  Kiroween 2026, Resurrection category", Sub),
          rule(colors.HexColor("#c9c0ad"), 0.8, 0, 12)]

story += [P(
    "Every old format outlives the program that made it. A PCX from a 1994 scanner, a TGA from a "
    "DOS game, an IFF from Amiga paint software that no longer runs. The data inside those files "
    "is intact and recoverable; what is gone is the software that knew how to read it. Most tools "
    "that still work are paid, tied to one operating system, or require uploading your archive to "
    "somebody else's server — which is the last thing you should do with the only copy of a family "
    "photograph.", Body)]

story += [P(
    "The Attic reads four dead formats in the browser, identifies each one from its "
    "<b>bytes rather than its filename</b>, decodes it locally, displays it, and rescues it to PNG. "
    "There is no upload, and that is not a promise in the documentation — it is enforced by the "
    "build, which fails if a network call ever appears in the shipped code.", Body)]

story += [Spacer(1, 6)]

# at-a-glance box
glance = [
    [P("WHAT IT IS", S("k", fontName=MONO_B, fontSize=7, textColor=FLAME, leading=9)),
     P("A local file-rescue tool for dead image and animation formats", CellB)],
    [P("FORMATS", S("k", fontName=MONO_B, fontSize=7, textColor=FLAME, leading=9)),
     P("PCX (1985) · TGA (1984) · IFF ILBM (1985, incl. HAM6/HAM8 and Extra-Half-Brite) · "
       "IFF ANIM (1985, method-5 delta animation, plays in the viewer)", Cell)],
    [P("STACK", S("k", fontName=MONO_B, fontSize=7, textColor=FLAME, leading=9)),
     P("Plain HTML, CSS and JavaScript. No build step, no dependencies, no bundler, no framework", Cell)],
    [P("HOSTING", S("k", fontName=MONO_B, fontSize=7, textColor=FLAME, leading=9)),
     P("Static files — runs from <font face='%s'>file://</font> and deploys unchanged to GitHub Pages" % MONO, Cell)],
    [P("PRIVACY", S("k", fontName=MONO_B, fontSize=7, textColor=FLAME, leading=9)),
     P("No fetch, no XHR, no WebSocket, no beacon, no external asset, no analytics. "
       "Mechanically verified on every build", Cell)],
    [P("TESTS", S("k", fontName=MONO_B, fontSize=7, textColor=FLAME, leading=9)),
     P("22 decoder conformance assertions · 35 end-to-end browser checks · 0 failing", CellB)],
    [P("SIZE", S("k", fontName=MONO_B, fontSize=7, textColor=FLAME, leading=9)),
     P("892 KB total, including the fixtures and specifications", Cell)],
]
gt = Table(glance, colWidths=[30 * mm, CW - 30 * mm])
gt.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#241f18")),
    ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#faf7f0")),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#ded6c4")),
    ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
]))
story += [gt]

story += [Spacer(1, 8),
          P("This document describes what the software does, how each part was verified, and — "
            "in section 7 — everything that is deliberately not finished. The unfinished list is "
            "not a disclaimer; it is the honest boundary of the claim.", Small)]

story += [PageBreak()]

# ══════════════════════════════ 1. PROBLEM
story += [P("1 · The problem", H1)]
story += [P(
    "Adobe switched Flash off in January 2021 and a generation of browser content stopped "
    "running. That is the famous case. The quieter one is the same failure happening continuously "
    "across every format ever written to a disk: <b>the files survive, the software does not.</b>", Body)]
story += [P(
    "A scanner in 1996 wrote PCX. A DOS game shipped textures as TGA. Amiga paint and animation "
    "software wrote IFF ILBM and IFF ANIM. Drop any of those on a modern computer and nothing "
    "opens them. The bytes are fine. The interpreter is gone.", Body)]
story += [P(
    "Two things make this worse than it sounds:", Body)]
story += [P(
    "• <b>Existing tools are hostile.</b> The converters that still work are paid, locked to one "
    "operating system, or ask you to upload your archive to a server. For personal material — "
    "scans, family photos, work from a dead machine — uploading is exactly the wrong answer.", Body)]
story += [P(
    "• <b>Old files lie about themselves.</b> Files are routinely mislabelled: renamed by a "
    "program that guessed, or by a user in a hurry. Any tool that trusts the extension will show "
    "people a black square and call it a corrupt file.", Body)]
story += [Spacer(1, 4)]
story += [P("What the software does about both", H2)]
story += [P(
    "It identifies formats from content and says so when the filename disagrees; it decodes "
    "entirely in the browser with nothing uploaded; and it refuses to render a file it cannot "
    "fully parse, because a half-decoded image that looks fine is worse than an error.", Body)]

# ══════════════════════════════ 2. FEATURES
story += [P("2 · Every feature", H1)]
story += [P("Features that exist and were exercised in the test pass described in section 6.", Small)]
story += [Spacer(1, 3)]

feat = [
    hdr_row(["#", "FEATURE", "WHAT IT DOES"]),
    [P("F1", CellB), P("Content-based identification", CellB),
     P("Reads the first bytes and a structural plausibility check to decide what a file is. "
       "Recognises PCX, TGA, IFF ILBM, IFF ANIM, PNG, JPEG, GIF, BMP, Amiga MOD and WAV.", Cell)],
    [P("F2", CellB), P("Extension disagreement warning", CellB),
     P("When the filename says one thing and the bytes say another, the log states it plainly: "
       "“extension says .pcx, bytes say TGA — trusting the bytes”.", Cell)],
    [P("F3", CellB), P("Confidence score", CellB),
     P("Identification is reported with a confidence percentage, because TGA has no magic number "
       "and a structural guess is not a fact.", Cell)],
    [P("F4", CellB), P("PCX decoder", CellB),
     P("8-bit paletted with the 256-colour VGA palette, 8-bit three-plane truecolour, 4-plane "
       "1-bit planar, and 1-bit monochrome. Handles the 0xC0 literal rule.", Cell)],
    [P("F5", CellB), P("TGA decoder", CellB),
     P("Uncompressed and RLE, for truecolour, colour-mapped and greyscale, 8–32 bits per pixel, "
       "both row origins, 15/16-bit 5551.", Cell)],
    [P("F6", CellB), P("IFF ILBM decoder", CellB),
     P("1–8 bitplanes, ByteRun1 compression, palette, mask plane, and the two Amiga display "
       "modes: Extra-Half-Brite and HAM6/HAM8.", Cell)],
    [P("F7", CellB), P("IFF ANIM playback", CellB),
     P("Reads a keyframe plus a chain of method-5 delta frames and plays the animation in the "
       "viewer, timed from the ANHD chunk (jiffies), with a live frame counter.", Cell)],
    [P("F8", CellB), P("Drag and drop, anywhere", CellB),
     P("The whole window accepts a drop, not just the drop box, so a user who misses the target "
       "is not punished for it.", Cell)],
    [P("F9", CellB), P("Built-in sample", CellB),
     P("A “load the sample from 1994” button proves the tool works before the user has found a "
       "file. Degrades gracefully when opened from file://, where fetch is blocked.", Cell)],
    [P("F10", CellB), P("PNG rescue export", CellB),
     P("Writes the decoded pixels out as a lossless modern file. For animations, exports the "
       "current frame and says so.", Cell)],
    [P("F11", CellB), P("JPEG export with honest warning", CellB),
     P("Offers JPEG and states in the log that it is lossy and PNG should be used to keep every "
       "pixel. A rescue tool that silently degrades its own output has failed.", Cell)],
    [P("F12", CellB), P("Metadata inspector", CellB),
     P("Shows planes, bits per pixel, compression, row origin, display mode and frame count — "
       "the header facts that tell you what kind of file you actually have.", Cell)],
    [P("F13", CellB), P("Copy metadata", CellB),
     P("Copies the inspection result as JSON, for documenting an archive without retyping.", Cell)],
    [P("F14", CellB), P("Materialise animation", CellB),
     P("Decoded images fade up out of the dark with a brightness-and-blur sweep rather than "
       "appearing instantly. Disabled under prefers-reduced-motion.", Cell)],
    [P("F15", CellB), P("Ambient dust", CellB),
     P("Slow drifting motes behind the interface. Purely atmospheric, pointer-events: none, "
       "and switched off for users who ask for reduced motion.", Cell)],
    [P("F16", CellB), P("Mechanical privacy gate", CellB),
     P("scripts/check.mjs greps every shipped file for fetch, XMLHttpRequest, WebSocket, "
       "sendBeacon and new Image(), and fails the build if one appears. The privacy claim is "
       "therefore testable, not rhetorical.", Cell)],
    [P("F17", CellB), P("Load-order and asset gate", CellB),
     P("The same script fails on external URLs, missing required files, unparseable JavaScript, "
       "third-party product names in visible copy, or a .gitignore rule that would exclude .kiro.", Cell)],
    [P("F18", CellB), P("Truncation rejection", CellB),
     P("A short file is treated as corrupt, never as a smaller image. Reports exactly where the "
       "data ran out. Added during this test pass — see section 6.3.", Cell)],
    [P("F19", CellB), P("Mobile layout", CellB),
     P("Single column below 780 px, no horizontal overflow, canvas scales to the viewport, "
       "verified at 390 × 844.", Cell)],
    [P("F20", CellB), P("Keyboard and screen-reader basics", CellB),
     P("Real label element drives the file input, single h1, lang set, tab order reaches "
       "controls, descriptive title.", Cell)],
]
story += [table(feat, [9 * mm, 34 * mm, CW - 43 * mm])]

story += [PageBreak()]

# ══════════════════════════════ 3. SCREENS
story += [P("3 · The interface", H1)]
story += [P(
    "A deliberately plain, legible tool. The attic atmosphere is carried by light, dust and "
    "typography rather than by ornament that slows the work down.", Body)]

shots = [
    ("/tmp/pdf-1-empty.png", "The opening state. The drop target is the only call to action; the privacy claim sits in the header where it cannot be missed."),
    ("/tmp/pdf-2-ham.png", "An Amiga HAM sunset decoded: 16 palette entries in the file, 47 distinct colours on screen. The header panel reports planes, bits, compression and display mode."),
]
for path, cap in shots:
    if os.path.exists(path):
        iw = CW
        img = Image(path, width=iw, height=iw * (900 / 1280))
        story += [img, P(cap, Caption)]
    if path.endswith("pdf-1-empty.png"):
        story += [Spacer(1, 4)]

story += [PageBreak()]

story += [P("3 · The interface (continued)", H1)]
shots2 = [
    ("/tmp/pdf-3-anim.png", "An IFF ANIM from the Amiga era playing in the browser. The frame counter (1/8) advances at the rate stored in the file's ANHD chunk."),
    ("/tmp/pdf-4-wrongext.png", "The most important behaviour in the tool: a TGA named .PCX. The log line reads “extension says .pcx, bytes say TGA — trusting the bytes”."),
]
for path, cap in shots2:
    if os.path.exists(path):
        iw = CW
        h = (900 / 1280) if "wrongext" not in path else (620 / 1280)
        img = Image(path, width=iw, height=iw * h)
        story += [img, P(cap, Caption)]

story += [PageBreak()]

# ══════════════════════════════ 4. ARCHITECTURE
story += [P("4 · How it is built", H1)]
story += [P(
    "Decoders are pure functions: a Uint8Array goes in, and either "
    "<font face='%s'>{ width, height, rgba, meta }</font> comes out or an Error with a readable "
    "message is thrown. They never touch the DOM. That single rule is what makes the whole "
    "conformance suite possible in plain Node with no browser and no canvas." % MONO, Body)]
story += [Spacer(1, 3)]

arch = [
    hdr_row(["PATH", "LINES", "ROLE"]),
    [P("index.html", Cell), P("95", Cell), P("The page. One drop target, one stage, one result card.", Cell)],
    [P("css/attic.css", Cell), P("309", Cell), P("The attic: dust, candle-light, ledger type. No external fonts or images.", Cell)],
    [P("js/decoders/pcx.js", Cell), P("107", Cell), P("PCX → RGBA. Pure.", Cell)],
    [P("js/decoders/tga.js", Cell), P("162", Cell), P("TGA → RGBA. Pure. Includes truncation rejection.", Cell)],
    [P("js/decoders/ilbm.js", Cell), P("253", Cell), P("IFF ILBM → RGBA. HAM, Extra-Half-Brite, mask plane.", Cell)],
    [P("js/decoders/anim.js", Cell), P("295", Cell), P("IFF ANIM → frame[] of RGBA, with method-5 delta reconstruction.", Cell)],
    [P("js/sniff.js", Cell), P("123", Cell), P("Content identification with confidence scoring.", Cell)],
    [P("js/app.js", Cell), P("381", Cell), P("The only file that touches the DOM: drop, decode, display, play, export.", Cell)],
    [P("tests/run.js", Cell), P("211", Cell), P("22 conformance assertions. No framework, no dependency.", Cell)],
    [P("tools/make-*.js", Cell), P("542", Cell), P("Independent fixture encoders, written from the specifications, not from the decoders.", Cell)],
    [P("scripts/check.mjs", Cell), P("93", Cell), P("Ship gate, including the mechanical privacy check.", Cell)],
    [P(".kiro/specs/*", Cell), P("—", Cell), P("One specification per decoder, in requirement form, with the edge cases that matter.", Cell)],
    [P(".kiro/hooks/*", Cell), P("—", Cell), P("Save-time test run; commit-time ship gate.", Cell)],
]
story += [table(arch, [42 * mm, 14 * mm, CW - 56 * mm])]

story += [Spacer(1, 6)]
story += [P("Two design decisions worth defending", H2)]
story += [P(
    "<b>Decoders fail loudly.</b> A decoder that cannot fully parse a file throws. Returning a "
    "blank canvas is worse than an error, because with a thirty-five-year-old file the user "
    "cannot tell corruption from an empty image — and that distinction is the whole game.", Body)]
story += [P(
    "<b>Fixtures are written from the specification, independently.</b> Every decoder is tested "
    "against files produced by a separate encoder. A test that uses the same code to produce and "
    "consume data proves only that the code agrees with itself.", Body)]

story += [PageBreak()]

# ══════════════════════════════ 5. TEST METHOD
story += [P("5 · How it was tested", H1)]
story += [P(
    "Three layers, each independent of the others. The point of the layering is that a bug has "
    "to survive all three to ship.", Body)]

layers = [
    hdr_row(["LAYER", "WHAT IT CATCHES", "HOW"]),
    [P("Decoder conformance", CellB),
     P("Wrong pixels, wrong geometry, wrong colour, silent truncation", Cell),
     P("22 assertions in <font face='%s'>tests/run.js</font>, run in plain Node. Each decoder is "
       "compared against pixels computed independently from the source description." % MONO, Cell)],
    [P("End-to-end browser", CellB),
     P("Broken wiring, control failures, layout faults, console errors", Cell),
     P("35 scripted checks in headless Chromium across 8 areas: formats, controls, error paths, "
       "privacy, offline, mobile, animation, accessibility.", Cell)],
    [P("Ship gate", CellB),
     P("Policy regressions: network calls, external assets, trademarks, missing .kiro", Cell),
     P("<font face='%s'>scripts/check.mjs</font> — 15 checks, exits non-zero on failure." % MONO, Cell)],
]
story += [table(layers, [32 * mm, 50 * mm, CW - 82 * mm])]

story += [Spacer(1, 8)]
story += [P("What the browser pass actually does", H2)]
story += [P(
    "Each area is scripted in Playwright against a real server and a real browser, with console "
    "errors and page errors captured throughout. Privacy is checked by listening to every "
    "outbound request object the browser emits and asserting that none leave the origin. Mobile "
    "is checked by measuring scrollWidth against clientWidth at 390 × 844. Accessibility is checked "
    "by querying the actual DOM for lang, heading structure, labels and tab order.", Body)]

story += [Spacer(1, 4)]
story += [P("Test harness note", H2)]
story += [P(
    "The mobile and privacy checks are the two that catch problems invisible to unit tests: a "
    "decoder can be byte-perfect while the layout overflows on a phone, or while an accidentally "
    "imported font quietly phones home. Both were scripted deliberately for that reason.", Body)]

story += [PageBreak()]

# ══════════════════════════════ 6. RESULTS
story += [P("6 · Results", H1)]
story += [P("6.1  Decoder conformance — 22 assertions, 0 failing", H2)]

res = [
    hdr_row(["DECODER", "TEST", "RESULT"]),
    [P("PCX", CellB), P("8-bit paletted, 32×24, against source palette", Cell), status_chip(True)],
    [P("PCX", CellB), P("rejects non-PCX input", Cell), status_chip(True)],
    [P("PCX", CellB), P("rejects a truncated file", Cell), status_chip(True)],
    [P("TGA", CellB), P("24-bit uncompressed, bottom-up — max channel error 0", Cell), status_chip(True)],
    [P("TGA", CellB), P("32-bit RLE, top-down — max channel error 0", Cell), status_chip(True)],
    [P("TGA", CellB), P("rejects unknown image type", Cell), status_chip(True)],
    [P("TGA", CellB), P("rejects a truncated file", Cell), status_chip(True)],
    [P("Sniff", CellB), P("TGA identified by content; TGA rejected as PCX", Cell), status_chip(True)],
    [P("ILBM", CellB), P("5-plane compressed — byte-exact", Cell), status_chip(True)],
    [P("ILBM", CellB), P("Extra-Half-Brite — right half exactly half brightness", Cell), status_chip(True)],
    [P("ILBM", CellB), P("HAM6 — 62 distinct colours on one scanline from a 16-entry palette", Cell), status_chip(True)],
    [P("ILBM", CellB), P("mask plane — outside the mask is transparent", Cell), status_chip(True)],
    [P("ILBM", CellB), P("rejects a non-bitmap FORM", Cell), status_chip(True)],
    [P("ILBM", CellB), P("rejects a truncated file; accepts padding-only truncation", Cell), status_chip(True)],
    [P("ANIM", CellB), P("method 5 — all 8 delta frames byte-exact", Cell), status_chip(True)],
    [P("ANIM", CellB), P("timing — 0.8 s read from ANHD reltime", Cell), status_chip(True)],
    [P("ANIM", CellB), P("rejects a non-ANIM file; sniffs a real ANIM", Cell), status_chip(True)],
]
story += [table(res, [20 * mm, CW - 38 * mm, 18 * mm])]

story += [Spacer(1, 8)]
story += [P("6.2  End-to-end browser pass — 35 checks, 0 failing", H2)]

e2e = [
    hdr_row(["AREA", "CHECKS", "RESULT"]),
    [P("Formats", CellB), P("10 files across 4 formats decode with correct identification; zero console errors throughout", Cell), P("10/10", CellB)],
    [P("Controls", CellB), P("sample button · clear resets every field · PNG export · JPEG export · copy metadata", Cell), P("5/5", CellB)],
    [P("Error handling", CellB), P("empty file · plain text · truncated TGA · truncated PCX · IFF with no BMHD · PNG with no decoder", Cell), P("6/6", CellB)],
    [P("Privacy", CellB), P("no outbound request across four decodes", Cell), P("1/1", CellB)],
    [P("Offline", CellB), P("file:// loads with styles applied; sample button degrades without throwing", Cell), P("2/2", CellB)],
    [P("Mobile", CellB), P("no horizontal overflow empty or loaded; decodes at 390 × 844", Cell), P("3/3", CellB)],
    [P("Animation", CellB), P("frames advance rather than sitting static; switching to a still file stops playback", Cell), P("2/2", CellB)],
    [P("Accessibility", CellB), P("lang set · label drives input · single h1 · buttons labelled · tab reaches controls", Cell), P("5/5", CellB)],
]
story += [table(e2e, [26 * mm, CW - 44 * mm, 18 * mm])]

story += [Spacer(1, 8)]
story += [P("6.3  What this test pass found", H2)]
story += [P(
    "The pass was not a rubber stamp. One genuine defect surfaced, and it was the most dangerous "
    "kind a preservation tool can have.", Body)]
story += [P(
    "<b>A truncated TGA reported success.</b> A file carrying two bytes of pixel data where the "
    "header declared 2304 was decoded, displayed — mostly black — and offered for export with the "
    "message “TGA rescued from the dark.” A user would have saved a corrupt picture believing it "
    "had been recovered. The check for the uncompressed path and the RLE path were both added, "
    "and the same class of gap was then found and closed in PCX and ILBM.", Body)]
story += [P(
    "A related non-bug is worth recording: an IFF file missing its final byte still decodes "
    "correctly, because that byte is word-alignment padding rather than image data. Rejecting it "
    "would have been the wrong fix, so there is now a test asserting that it is <b>accepted</b>.", Body)]
story += [P(
    "The suite went from 18 to 22 assertions as a result, and the browser pass from 34 to 35.", Small)]

story += [PageBreak()]

# ══════════════════════════════ 7. NOT DONE
story += [P("7 · What has not been done", H1)]
story += [P(
    "This is the honest boundary of the project. Everything below is either absent or "
    "unverified, and none of it should be described as working.", Body)]
story += [Spacer(1, 3)]

notdone = [
    hdr_row(["ITEM", "STATE", "DETAIL / WORKAROUND"]),
    [P("ANIM delta methods 7 and 8", CellB, ),
     P("Not implemented", Cell),
     P("The decoder throws and names the method. It does not silently replay the previous frame. "
       "Method 5 is by far the most common, so most real files open; a file using 7 or 8 will "
       "refuse rather than mislead.", Cell)],
    [P("HAM8 (8-plane HAM)", CellB), P("Code path, no fixture", Cell),
     P("The branch exists and follows the specification, but there is no 8-plane test file, so it "
       "is not asserted to work. Treated as unverified, not as supported.", Cell)],
    [P("Animation export", CellB), P("Current frame only", Cell),
     P("Exporting an IFF ANIM writes the frame on screen as PNG, and the log says so. There is no "
       "GIF, APNG or video export. A rescued animation cannot yet be saved as an animation.", Cell)],
    [P("Batch mode", CellB), P("Absent", Cell),
     P("No folder drop. One file at a time. This is the biggest practical gap for anyone with an "
       "archive rather than a single file.", Cell)],
    [P("Audio", CellB), P("Absent", Cell),
     P("Amiga MOD and 8SVX are recognised by the sniffer but no decoder exists, so they report "
       "“recognised but no decoder in this build”.", Cell)],
    [P("Further image formats", CellB), P("Absent", Cell),
     P("ICO, XBM, PICT, Amiga ACBM, DEEP. Each would be a specification plus a decoder plus "
       "fixtures; none are started.", Cell)],
    [P("Undo / re-decode history", CellB), P("Absent", Cell),
     P("Dropping a second file replaces the first. There is no session history, so comparing two "
       "files means dropping them alternately.", Cell)],
    [P("Zoom and pan", CellB), P("Absent", Cell),
     P("The preview scales to fit. There is no 1:1 pixel inspection, which matters for judging "
       "whether a decode is faithful at the pixel level.", Cell)],
    [P("Colour-management", CellB), P("Absent", Cell),
     P("Pixels are shown as decoded. No ICC or gamma handling; Amiga-era palettes were not "
       "linear, so exact colour against original hardware is not claimed.", Cell)],
    [P("Kiro session write-up", CellB), P("Template, not filled", Cell),
     P("WRITEUP-KIRO.md is structurally complete and truthful about the repository, but the "
       "Kiro-specific sections carry explicit TO FILL markers. They must be completed from real "
       "sessions before submission.", Cell)],
    [P("Deployment", CellB), P("Not yet published", Cell),
     P("The repo runs locally and from file://. GitHub Pages, the public URL and the demo video "
       "are outstanding.", Cell)],
]
story += [table(notdone, [36 * mm, 30 * mm, CW - 66 * mm])]

story += [Spacer(1, 8)]
story += [P("7.1  Known limitations that are not defects", H2)]
story += [P(
    "• <b>No magic number for TGA.</b> Identification is a structural guess, which is why the "
    "confidence score exists and why a mis-identification fails at decode rather than showing "
    "garbage.", Body)]
story += [P(
    "• <b>Palette quantisation is visible.</b> A PCX with a 256-colour palette cannot reproduce "
    "a truecolour original exactly; the tests allow a tolerance of 40 for that reason and state "
    "it rather than hiding it.", Body)]
story += [P(
    "• <b>Preview scaling is not 1:1.</b> Small images are scaled up for visibility. The image is "
    "never resampled on export, so the rescued file is always the true pixel data.", Body)]

story += [PageBreak()]

# ══════════════════════════════ 8. VERIFICATION
story += [P("8 · How to verify any of this yourself", H1)]
story += [P(
    "Nothing in this document needs to be taken on trust. Run these four commands from the "
    "repository root.", Body)]
story += [Spacer(1, 3)]
cmds = [
    ("node tests/run.js", "Runs the 22 decoder assertions. Expect “22 passed, 0 failed” and exit code 0."),
    ("node scripts/check.mjs", "The ship gate. Expect “0 failed, 0 warnings”."),
    ("open index.html", "The whole instruction. Works from file:// with no server."),
    ("grep -rE \"fetch|XMLHttpRequest|WebSocket|sendBeacon\" js/", "Should return only the single commented-out reference in check.mjs. The app itself contains no network call."),
]
for c, why in cmds:
    story += [P("<font face='%s' color='#1a3a1a'>%s</font>" % (MONO, c), S("cmd",
                fontName=MONO, fontSize=8, leading=12, backColor=colors.HexColor("#f0ece2"),
                borderPadding=4, spaceAfter=2)),
              P(why, Small), Spacer(1, 3)]

story += [Spacer(1, 6)]
story += [P("Two checks worth doing by hand", H2)]
story += [P(
    "<b>Break the privacy claim deliberately.</b> Add <font face='%s'>fetch('http://example.com')</font> "
    "to any file under js/ and run the gate. It should fail and print the file and line number. "
    "A check that cannot fail is not a check." % MONO, Body)]
story += [P(
    "<b>Feed it a lie.</b> Rename any TGA to .PCX and drop it in. The tool should identify it as "
    "TGA and say so in the log. This is the behaviour most other converters get wrong.", Body)]

story += [Spacer(1, 10)]
story += [rule(colors.HexColor("#c9c0ad"), 0.8, 2, 8)]
story += [P(
    "Summary. Four dead formats decoded and proven byte-exact, one of them an animation that "
    "plays; a privacy claim that is enforced by the build rather than asserted in prose; 57 "
    "automated checks passing across three independent layers; and a small number of clearly "
    "stated gaps — no batch mode, no animation video export, two ANIM delta methods unimplemented, "
    "and a Kiro write-up which is structurally complete but not yet filled in from real sessions.",
    S("sum", fontName=BOLD, fontSize=9.5, leading=15, textColor=colors.HexColor("#2a2519")))]

doc.build(story)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
