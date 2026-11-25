/* Build spec-compliant test files so the decoders are proven against
   bytes we control, not just against whatever sample turned up. */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'fixtures');
fs.mkdirSync(OUT, { recursive: true });

/* ---------- expected image: a 32x24 test card ---------- */
function expected(w, h) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    px[o]     = Math.round(x / (w - 1) * 255);        // red ramps across
    px[o + 1] = Math.round(y / (h - 1) * 255);        // green ramps down
    px[o + 2] = (x + y) % 16 === 0 ? 255 : 40;        // blue stripes
    px[o + 3] = 255;
  }
  return px;
}
const W = 32, H = 24;

/* ---------- PCX: 8-bit, single plane, 256-colour palette ---------- */
function buildPCX() {
  const px = expected(W, H);
  const bytesPerLine = W + (W % 2);           // must be even
  const header = Buffer.alloc(128);
  header[0] = 0x0A; header[1] = 5; header[2] = 1; header[3] = 8;
  header.writeUInt16LE(0, 4); header.writeUInt16LE(0, 6);
  header.writeUInt16LE(W - 1, 8); header.writeUInt16LE(H - 1, 10);
  header.writeUInt16LE(72, 12); header.writeUInt16LE(72, 14);   // dpi
  header[65] = 1;                              // planes
  header.writeUInt16LE(bytesPerLine, 66);
  header.writeUInt16LE(1, 68);                 // palette info: colour

  /* encode the truecolour card into a 256-colour palette deterministically:
     we palette-map by (r>>5)<<5 | (g>>5)<<2 | (b>>6) -> 256 entries, then
     write the index stream. The decoder must recover the palette exactly. */
  const pal = Buffer.alloc(768);
  const idx = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const k = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
    idx[i] = k;
    // sample the palette source ONCE per index so every pixel using that
    // index decodes to the same colour (a real paletted file behaves this way)
    pal[k * 3]     = Math.round((r >> 5) * 255 / 7);
    pal[k * 3 + 1] = Math.round((g >> 5) * 255 / 7);
    pal[k * 3 + 2] = Math.round((b >> 6) * 255 / 3);
  }

  /* RLE each scanline */
  const out = [header];
  for (let y = 0; y < H; y++) {
    const line = Buffer.alloc(bytesPerLine);
    for (let x = 0; x < W; x++) line[x] = idx[y * W + x];
    /* Correct PCX RLE. The subtle part: a literal byte >= 0xC0 has its top
       two bits set, so it would be read back as a run header. The spec
       requires such bytes to be written as an explicit run of length 1
       (0xC1, value). Getting this wrong is the single most common PCX bug. */
    const outLine = [];
    let i = 0;
    while (i < bytesPerLine) {
      let n = 1;
      while (i + n < bytesPerLine && line[i + n] === line[i] && n < 63) n++;
      if (n > 1) { outLine.push(0xC0 | n, line[i]); i += n; }
      else if (line[i] >= 0xC0) { outLine.push(0xC1, line[i]); i += 1; }
      else { outLine.push(line[i]); i += 1; }
    }
    out.push(Buffer.from(outLine));
  }
  out.push(Buffer.from([0x0C]), pal);
  return Buffer.concat(out);
}

/* ---------- TGA: uncompressed 24-bit, bottom-up (the classic case) ---------- */
function buildTGA24() {
  const px = expected(W, H);
  const h = Buffer.alloc(18);
  h[2] = 2;                                   // uncompressed truecolour
  h.writeUInt16LE(W, 12); h.writeUInt16LE(H, 14);
  h[16] = 24; h[17] = 0;                      // bottom-up
  const data = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const srcRow = H - 1 - y;                 // store bottom-up
    for (let x = 0; x < W; x++) {
      const s = (srcRow * W + x) * 4, d = (y * W + x) * 3;
      data[d] = px[s + 2]; data[d + 1] = px[s + 1]; data[d + 2] = px[s];
    }
  }
  return Buffer.concat([h, data]);
}

/* ---------- TGA: RLE 32-bit, top-down ---------- */
function buildTGA32RLE() {
  const px = expected(W, H);
  const h = Buffer.alloc(18);
  h[2] = 10;                                  // RLE truecolour
  h.writeUInt16LE(W, 12); h.writeUInt16LE(H, 14);
  h[16] = 32; h[17] = 0x20 | 0x08;            // top-down + 8 alpha bits
  const out = [h];
  const pxAt = (x, y) => {
    const s = (y * W + x) * 4;
    return [px[s + 2], px[s + 1], px[s], 255];     // TGA stores B,G,R,A
  };
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const cur = pxAt(x, y);
      let n = 1;
      while (x + n < W && n < 128 && same(cur, pxAt(x + n, y))) n++;
      if (n >= 2) {
        out.push(Buffer.from([0x80 | (n - 1)].concat(cur)));   // run-length packet
        x += n;
      } else {
        out.push(Buffer.from([0].concat(cur)));                // raw packet of 1
        x++;
      }
    }
  }
  return Buffer.concat(out);
}

fs.writeFileSync(path.join(OUT, 'testcard.pcx'), buildPCX());
fs.writeFileSync(path.join(OUT, 'testcard24.tga'), buildTGA24());
fs.writeFileSync(path.join(OUT, 'testcard32rle.tga'), buildTGA32RLE());
fs.writeFileSync(path.join(OUT, 'expected.json'), JSON.stringify({ w: W, h: H, px: Array.from(expected(W, H)) }));
console.log('fixtures written:', fs.readdirSync(OUT).join(', '));
