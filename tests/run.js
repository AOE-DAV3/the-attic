/* Decoder conformance tests. No framework, no dependencies — run with `node tests/run.js`.
   Each decoder must reproduce the source image within the error its format allows. */
const fs = require('fs'), path = require('path');
const FIX = path.join(__dirname, '..', 'fixtures');
const PCX = require(path.join(__dirname, '..', 'js', 'decoders', 'pcx.js'));
const TGA = require(path.join(__dirname, '..', 'js', 'decoders', 'tga.js'));
const ILBM = require(path.join(__dirname, '..', 'js', 'decoders', 'ilbm.js'));
const ANIM = require(path.join(__dirname, '..', 'js', 'decoders', 'anim.js'));

const exp = JSON.parse(fs.readFileSync(path.join(FIX, 'expected.json'), 'utf8'));
const expect = Uint8Array.from(exp.px);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + m); };
const no = (m) => { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + m); };

function compare(name, got, tol) {
  if (!got) return no(name + ' — decode returned nothing');
  if (got.width !== exp.w || got.height !== exp.h) {
    return no(`${name} — size ${got.width}x${got.height}, expected ${exp.w}x${exp.h}`);
  }
  let worst = 0, at = -1;
  for (let i = 0; i < expect.length; i++) {
    if (i % 4 === 3) continue;                     // skip alpha
    const d = Math.abs(got.rgba[i] - expect[i]);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) ok(`${name} — ${exp.w}x${exp.h}, max channel error ${worst}`);
  else no(`${name} — max channel error ${worst} at byte ${at} (tolerance ${tol})`);
}

console.log('\nATTIC — decoder conformance\n');

/* PCX: 8-bit palette means colour is quantised to the palette,
   so a correct decoder still differs from the truecolour source. */
try {
  compare('PCX 8-bit palette', PCX.decode(fs.readFileSync(path.join(FIX, 'testcard.pcx'))), 40);
} catch (e) { no('PCX 8-bit palette — threw: ' + e.message); }

/* TGA 24-bit is lossless, so it must be exact. */
try {
  compare('TGA 24-bit uncompressed', TGA.decode(fs.readFileSync(path.join(FIX, 'testcard24.tga'))), 0);
} catch (e) { no('TGA 24-bit uncompressed — threw: ' + e.message); }

/* TGA RLE is lossless too — this checks the whole RLE path and the origin bit. */
try {
  compare('TGA 32-bit RLE top-down', TGA.decode(fs.readFileSync(path.join(FIX, 'testcard32rle.tga'))), 0);
} catch (e) { no('TGA 32-bit RLE top-down — threw: ' + e.message); }

/* Rejection: a decoder must fail loudly, never return garbage. */
try { PCX.decode(Buffer.from('this is not a pcx file at all, definitely not')); no('PCX rejects non-PCX input'); }
catch (e) { ok('PCX rejects non-PCX input'); }

try {
  const bad = Buffer.from(fs.readFileSync(path.join(FIX, 'testcard24.tga')));
  bad[2] = 77;                                     // impossible image type
  TGA.decode(bad); no('TGA rejects unknown image type');
} catch (e) { ok('TGA rejects unknown image type'); }

/* Sniffing: TGA has no magic number, so this is the weak point. */
if (TGA.sniff(fs.readFileSync(path.join(FIX, 'testcard24.tga')))) ok('TGA sniff identifies a real TGA');
else no('TGA sniff identifies a real TGA');
if (!TGA.sniff(fs.readFileSync(path.join(FIX, 'testcard.pcx')))) ok('TGA sniff rejects a PCX');
else no('TGA sniff rejects a PCX');

/* ---------- ILBM ---------- */

/* Standard 5-plane: lossless, must be exact against the palette we wrote. */
try {
  const exp2 = JSON.parse(fs.readFileSync(path.join(FIX, 'expected-ilbm.json'), 'utf8'));
  const want = Uint8Array.from(exp2.px);
  const got = ILBM.decode(fs.readFileSync(path.join(FIX, 'amiga-standard.iff')));
  if (got.width !== exp2.w || got.height !== exp2.h) throw new Error('wrong size');
  let worst = 0;
  for (let i = 0; i < want.length; i++) {
    if (i % 4 === 3) continue;
    worst = Math.max(worst, Math.abs(got.rgba[i] - want[i]));
  }
  if (worst === 0) ok(`ILBM 5-plane compressed — ${got.width}x${got.height}, exact`);
  else no(`ILBM 5-plane compressed — max channel error ${worst}`);
} catch (e) { no('ILBM 5-plane compressed — threw: ' + e.message); }

/* Extra-Half-Brite: right half of the image must be exactly half the brightness. */
try {
  const got = ILBM.decode(fs.readFileSync(path.join(FIX, 'amiga-ehb.iff')));
  const midY = Math.floor(got.height / 2) * got.width;
  const bright = got.rgba.subarray(midY * 4, midY * 4 + 4);          // left edge
  const dimAt  = got.rgba.subarray(midY * 4 + (got.width - 1) * 4, midY * 4 + got.width * 4); // right edge
  const sameIdx = (bright[0] >> 0);
  const okHalf = Math.abs(dimAt[0] - Math.floor(bright[0] / 2)) <= 1 &&
                 Math.abs(dimAt[1] - Math.floor(bright[1] / 2)) <= 1;
  if (got.meta.mode === 'Extra-Half-Brite' && okHalf) ok('ILBM Extra-Half-Brite — right half is exactly half brightness');
  else no(`ILBM Extra-Half-Brite — mode "${got.meta.mode}", bright ${Array.from(bright.slice(0,3))} vs dim ${Array.from(dimAt.slice(0,3))}`);
} catch (e) { no('ILBM Extra-Half-Brite — threw: ' + e.message); }

/* HAM: the point is that decoded colour must CHANGE along the row and stay
   within range. A wrong implementation leaves it flat or blows the values out. */
try {
  const got = ILBM.decode(fs.readFileSync(path.join(FIX, 'amiga-ham.iff')));
  const y = 10;
  let distinct = new Set(), inRange = true;
  for (let x = 0; x < got.width; x++) {
    const o = (y * got.width + x) * 4;
    const key = got.rgba[o] + ',' + got.rgba[o + 1] + ',' + got.rgba[o + 2];
    distinct.add(key);
    for (let c = 0; c < 3; c++) if (got.rgba[o + c] < 0 || got.rgba[o + c] > 255) inRange = false;
  }
  if (got.meta.mode === 'HAM' && distinct.size > 8 && inRange) {
    ok(`ILBM HAM6 — ${distinct.size} distinct colours across one scanline, all in range`);
  } else no(`ILBM HAM6 — mode "${got.meta.mode}", ${distinct.size} distinct, inRange=${inRange}`);
} catch (e) { no('ILBM HAM6 — threw: ' + e.message); }

/* Mask plane: pixels outside the mask must come out transparent. */
try {
  const got = ILBM.decode(fs.readFileSync(path.join(FIX, 'amiga-masked.iff')));
  const y = 5;
  const leftAlpha  = got.rgba[((y * got.width) + 2) * 4 + 3];
  const centreAlpha = got.rgba[((y * got.width) + Math.floor(got.width / 2)) * 4 + 3];
  if (leftAlpha === 0 && centreAlpha === 255) ok('ILBM mask plane — outside the mask is transparent');
  else no(`ILBM mask plane — left alpha ${leftAlpha}, centre alpha ${centreAlpha}`);
} catch (e) { no('ILBM mask plane — threw: ' + e.message); }

/* Rejection and sniffing */
try { ILBM.decode(Buffer.from('FORMxxxxJUNKnot a bitmap at all....')); no('ILBM rejects a non-bitmap FORM'); }
catch (e) { ok('ILBM rejects a non-bitmap FORM'); }

if (ILBM.sniff(fs.readFileSync(path.join(FIX, 'amiga-standard.iff')))) ok('ILBM sniff identifies a real IFF');
else no('ILBM sniff identifies a real IFF');
if (!ILBM.sniff(fs.readFileSync(path.join(FIX, 'testcard.pcx')))) ok('ILBM sniff rejects a PCX');
else no('ILBM sniff rejects a PCX');

/* ---------- ANIM ---------- */

/* Every delta frame must reproduce the independently computed frame exactly.
   A method-5 decoder that mishandles op counts or skip semantics still produces
   a plausible image, so per-frame byte comparison is the only honest test. */
try {
  const exp3 = JSON.parse(fs.readFileSync(path.join(FIX, 'expected-anim.json'), 'utf8'));
  const got = ANIM.decode(fs.readFileSync(path.join(FIX, 'walking-bars.anim')));
  if (got.frames.length !== exp3.frames.length) {
    no(`ANIM frame count — got ${got.frames.length}, expected ${exp3.frames.length}`);
  } else {
    let badFrame = -1, worst = 0;
    for (let f = 0; f < exp3.frames.length; f++) {
      const want = exp3.frames[f];
      for (let i = 0; i < want.length; i++) {
        if (i % 4 === 3) continue;
        const dx = Math.abs(got.frames[f].rgba[i] - want[i]);
        if (dx > worst) { worst = dx; badFrame = f; }
      }
    }
    if (worst === 0) ok(`ANIM method-5 — all ${got.frames.length} delta frames byte-exact`);
    else no(`ANIM method-5 — frame ${badFrame} differs by ${worst}`);
  }
} catch (e) { no('ANIM method-5 — threw: ' + e.message); }

/* Timing must come out of ANHD.reltime, not be invented. */
try {
  const got = ANIM.decode(fs.readFileSync(path.join(FIX, 'walking-bars.anim')));
  const secs = got.meta.seconds;
  /* 8 frames at 6 jiffies each = 48/60 = 0.8s */
  if (Math.abs(secs - 0.8) < 0.05) ok(`ANIM timing — ${secs}s from ANHD reltime`);
  else no(`ANIM timing — got ${secs}s, expected ~0.8s`);
} catch (e) { no('ANIM timing — threw: ' + e.message); }

try { ANIM.decode(fs.readFileSync(path.join(FIX, 'testcard.pcx'))); no('ANIM rejects a non-ANIM file'); }
catch (e) { ok('ANIM rejects a non-ANIM file'); }

if (ANIM.sniff(fs.readFileSync(path.join(FIX, 'walking-bars.anim')))) ok('ANIM sniff identifies a real ANIM');
else no('ANIM sniff identifies a real ANIM');

/* ---------- TRUNCATION: a short file is corrupt, never a smaller image ----------
   This class of bug is the most dangerous a preservation tool can have, because
   it reports success while silently discarding the data the user came to save. */

try {
  const full = fs.readFileSync(path.join(FIX, 'testcard24.tga'));
  TGA.decode(full.subarray(0, 20));
  no('TGA rejects a truncated file');
} catch (e) {
  ok('TGA rejects a truncated file — ' + /truncated/.test(e.message));
}

try {
  const full = fs.readFileSync(path.join(FIX, 'testcard.pcx'));
  PCX.decode(full.subarray(0, 400));
  no('PCX rejects a truncated file');
} catch (e) {
  ok('PCX rejects a truncated file — ' + /truncated/.test(e.message));
}

try {
  const full = fs.readFileSync(path.join(FIX, 'amiga-standard.iff'));
  ILBM.decode(full.subarray(0, 400));
  no('ILBM rejects a truncated file');
} catch (e) {
  ok('ILBM rejects a truncated file — ' + /truncated/.test(e.message));
}

/* ...but a file missing only its word-alignment padding is still valid. */
try {
  const full = fs.readFileSync(path.join(FIX, 'amiga-standard.iff'));
  const d = ILBM.decode(full.subarray(0, full.length - 1));
  if (d.width === 64 && d.height === 40) ok('ILBM accepts a file missing only its padding byte');
  else no('ILBM mis-handled a padding-only truncation');
} catch (e) {
  no('ILBM rejected a padding-only truncation: ' + e.message);
}

console.log(`\n  ${fail ? '\x1b[31m' : '\x1b[32m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
