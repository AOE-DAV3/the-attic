/* Build spec-compliant IFF ILBM files: a standard 5-plane image, an
   Extra-Half-Brite image, and a HAM6 image. Each is written by hand in
   IFF chunk order so the decoder is tested against the specification
   rather than against another library's output. */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'fixtures');

const W = 64, H = 40;

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xFFFF); return b; }
function fourcc(s) { return Buffer.from(s, 'ascii'); }
function pad(b) { return b.length & 1 ? Buffer.concat([b, Buffer.alloc(1)]) : b; }

function chunk(id, data) {
  return Buffer.concat([fourcc(id), u32(data.length), pad(data)]);
}

/* ByteRun1 compression, which is PackBits with IFF's exact edge cases */
function packBits(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    let run = 1;
    while (i + run < src.length && run < 128 && src[i + run] === src[i]) run++;
    if (run > 1) {
      out.push(257 - run, src[i]);
      i += run;
    } else {
      let lit = 1;
      while (i + lit < src.length && lit < 128 &&
             !(i + lit + 1 < src.length && src[i + lit] === src[i + lit + 1])) lit++;
      out.push(lit - 1);
      for (let k = 0; k < lit; k++) out.push(src[i + k]);
      i += lit;
    }
  }
  return Buffer.from(out);
}

function bmhd(w, h, planes, compression, masking) {
  const b = Buffer.alloc(20);
  b.writeUInt16BE(w, 0); b.writeUInt16BE(h, 2);
  b.writeUInt16BE(0, 4); b.writeUInt16BE(0, 6);      // x,y origin
  b[8] = planes; b[9] = masking; b[10] = compression; b[11] = 0;
  b.writeUInt16BE(1, 12);                            // transparent colour
  b[14] = 1; b[15] = 1;                              // aspect
  b.writeUInt16BE(w, 16); b.writeUInt16BE(h, 18);    // page size
  return b;
}

/* Write planar rows: bit `pl` of each pixel comes from plane `pl`, MSB first */
function planarBody(w, h, planes, idxAt) {
  const rowBytes = ((w + 15) >> 4) << 1;
  const rows = [];
  for (let y = 0; y < h; y++) {
    for (let pl = 0; pl < planes; pl++) {
      const row = Buffer.alloc(rowBytes);
      for (let x = 0; x < w; x++) {
        const idx = idxAt(x, y) & 0xFF;
        if ((idx >> pl) & 1) row[x >> 3] |= 0x80 >> (x & 7);
      }
      rows.push(row);
    }
  }
  return Buffer.concat(rows);
}

function form(chunks) {
  const body = Buffer.concat(chunks);
  return Buffer.concat([fourcc('FORM'), u32(body.length + 4), fourcc('ILBM'), body]);
}

/* ---------- palette: 32 distinct colours ---------- */
function makePalette(n) {
  const cm = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    cm[i * 3]     = Math.round(i / (n - 1) * 255);
    cm[i * 3 + 1] = Math.round((1 - i / (n - 1)) * 200);
    cm[i * 3 + 2] = (i * 37) & 0xFF;
  }
  return cm;
}

/* ---------- 1. standard 5-plane, compressed ---------- */
{
  const planes = 5, cmapEntries = 32;
  const cmap = makePalette(cmapEntries);
  const idxAt = (x, y) => ((x >> 2) + (y >> 2)) % cmapEntries;
  const raw = planarBody(W, H, planes, idxAt);
  const body = packBits(raw);
  fs.writeFileSync(path.join(OUT, 'amiga-standard.iff'),
    form([chunk('BMHD', bmhd(W, H, planes, 1, 0)), chunk('CMAP', cmap), chunk('BODY', body)]));

  const expected = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idxAt(x, y), o = (y * W + x) * 4;
    expected[o] = cmap[i * 3]; expected[o + 1] = cmap[i * 3 + 1]; expected[o + 2] = cmap[i * 3 + 2]; expected[o + 3] = 255;
  }
  fs.writeFileSync(path.join(OUT, 'expected-ilbm.json'),
    JSON.stringify({ w: W, h: H, px: Array.from(expected) }));
}

/* ---------- 2. Extra-Half-Brite: 6 planes, CAMG EHB bit ---------- */
{
  const planes = 6, cmapEntries = 32;
  const cmap = makePalette(cmapEntries);
  const idxAt = (x, y) => (x < W / 2 ? 0 : 32) | ((y >> 2) & 31);   // left half bright, right half half
  const raw = planarBody(W, H, planes, idxAt);
  const body = packBits(raw);
  const camg = u32(0x80);                                            // EHB
  fs.writeFileSync(path.join(OUT, 'amiga-ehb.iff'),
    form([chunk('BMHD', bmhd(W, H, planes, 1, 0)), chunk('CMAP', cmap),
          chunk('CAMG', camg), chunk('BODY', body)]));
}

/* ---------- 3. HAM6: 6 planes, CAMG HAM bit ---------- */
{
  const planes = 6, cmapEntries = 16;
  const cmap = makePalette(cmapEntries);
  /* a horizontal gradient built the HAM way: control 0 sets the base colour,
     then each step nudges one channel. control 1 = blue, 2 = red, 3 = green;
     the 4-bit data field scales 0..15 -> 0..255. */
  const idxAt = (x, y) => {
    if (x === 0) return 0;                                  // start from palette entry 0
    const phase = (x + y * 2) % 48;
    if (phase < 16) return 1 | ((phase & 15) << 2);          // ramp blue
    if (phase < 32) return 2 | (((phase - 16) & 15) << 2);   // ramp red
    return 3 | (((phase - 32) & 15) << 2);                   // ramp green
  };
  const raw = planarBody(W, H, planes, idxAt);
  const body = packBits(raw);
  const camg = u32(0x800);                                           // HAM
  fs.writeFileSync(path.join(OUT, 'amiga-ham.iff'),
    form([chunk('BMHD', bmhd(W, H, planes, 1, 0)), chunk('CMAP', cmap),
          chunk('CAMG', camg), chunk('BODY', body)]));
}

/* ---------- 4. masked 3-plane image ---------- */
{
  const planes = 3, cmapEntries = 8;
  const cmap = makePalette(cmapEntries);
  const idxAt = (x, y) => (x + y) % cmapEntries;
  const rowBytes = ((W + 15) >> 4) << 1;
  const rows = [];
  for (let y = 0; y < H; y++) {
    for (let pl = 0; pl < planes; pl++) {
      const row = Buffer.alloc(rowBytes);
      for (let x = 0; x < W; x++) if ((idxAt(x, y) >> pl) & 1) row[x >> 3] |= 0x80 >> (x & 7);
      rows.push(row);
    }
    const mask = Buffer.alloc(rowBytes);
    for (let x = 0; x < W; x++) if (x >= W / 4 && x < W * 3 / 4) mask[x >> 3] |= 0x80 >> (x & 7);
    rows.push(mask);
  }
  const body = packBits(Buffer.concat(rows));
  fs.writeFileSync(path.join(OUT, 'amiga-masked.iff'),
    form([chunk('BMHD', bmhd(W, H, planes, 1, 1)), chunk('CMAP', cmap), chunk('BODY', body)]));
}

console.log('ILBM fixtures written:', fs.readdirSync(OUT).filter(f => /iff$/.test(f)).join(', '));

/* ---------- 5. a HAM6 image that is actually worth looking at ----------
   HAM's whole trick: 16 palette colours, but each pixel may nudge one
   channel of the previous pixel, which gives thousands of colours. This
   builds a sunset the way an Amiga artist would have. */
{
  const w = 160, h = 100, planes = 6;
  const cmap = Buffer.alloc(16 * 3);
  /* the base palette: one blue, one deep red, a couple of skin tones */
  const base = [
    [8, 10, 40], [90, 20, 60], [200, 90, 40], [255, 200, 120],
    [20, 40, 90], [60, 20, 80], [150, 60, 50], [230, 140, 70],
    [5, 5, 20], [40, 10, 40], [120, 40, 60], [255, 240, 200],
    [10, 25, 70], [80, 40, 90], [180, 90, 80], [250, 180, 130]
  ];
  base.forEach((c, i) => { cmap[i*3]=c[0]; cmap[i*3+1]=c[1]; cmap[i*3+2]=c[2]; });

  /* Work out the index stream by simulating HAM while we design the image:
     start each row at a palette colour, then emit control codes that walk
     the channels toward the target pixel. */
  const idxAt = (x, y) => 0;   // filled in below by the simulation
  const indices = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let r = 0, g = 0, b = 0;
    let prevIdx = 0;
    for (let x = 0; x < w; x++) {
      if (x === 0) {
        /* sky gets darker toward the top; ground is near-black */
        const entry = y < h * 0.62 ? (y < h * 0.3 ? 0 : 1) : 8;
        indices[y*w+x] = entry;
        r = cmap[entry*3]; g = cmap[entry*3+1]; b = cmap[entry*3+2];
        continue;
      }
      const ground = y > h * 0.62;
      const sunY = h * 0.52, sunX = w * 0.62;
      const d = Math.hypot((x - sunX) * 0.72, y - sunY);
      const want = ground
        ? { r: 12 + (w - x) * 0.25, g: 8, b: 18 }
        : d < 18 ? { r: 255, g: 236, b: 190 }
        : d < 34 ? { r: 250, g: 170, b: 90 }
        : { r: 40 + y * 1.2, g: 30 + y * 0.5, b: 90 - y * 0.4 };
      /* pick the channel furthest from target and nudge it */
      const dr = want.r - r, dg = want.g - g, db = want.b - b;
      let ctrl, val;
      if (Math.abs(dr) >= Math.abs(dg) && Math.abs(dr) >= Math.abs(db)) {
        ctrl = 2; val = Math.max(0, Math.min(15, Math.round(want.r / 17)));
        r = val * 17;
      } else if (Math.abs(db) >= Math.abs(dg)) {
        ctrl = 1; val = Math.max(0, Math.min(15, Math.round(want.b / 17)));
        b = val * 17;
      } else {
        ctrl = 3; val = Math.max(0, Math.min(15, Math.round(want.g / 17)));
        g = val * 17;
      }
      indices[y*w+x] = ctrl | (val << 2);
    }
  }

  const raw = planarBody(w, h, planes, (x, y) => indices[y*w+x]);
  const body = packBits(raw);
  fs.writeFileSync(path.join(OUT, 'amiga-sunset-ham.iff'),
    form([chunk('BMHD', bmhd(w, h, planes, 1, 0)), chunk('CMAP', cmap),
          chunk('CAMG', u32(0x800)), chunk('BODY', body)]));
  console.log('wrote amiga-sunset-ham.iff');
}
