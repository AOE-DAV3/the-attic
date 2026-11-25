/* Build a FORM ANIM with a method-5 (byte vertical delta) second frame.
   The encoder below is written straight from the spec so the decoder is
   tested against an independent implementation, not against itself. */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'fixtures');

const W = 64, H = 48, PLANES = 4;
const rowBytes = ((W + 15) >> 4) << 1;          // 8

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xFFFF); return b; }
function fourcc(s) { return Buffer.from(s, 'ascii'); }
function pad(b) { return b.length & 1 ? Buffer.concat([b, Buffer.alloc(1)]) : b; }
function chunk(id, data) { return Buffer.concat([fourcc(id), u32(data.length), pad(data)]); }
function form(type, chunks) {
  const body = Buffer.concat([fourcc(type), ...chunks]);
  return Buffer.concat([fourcc('FORM'), u32(body.length), body]);
}

/* ---- a frame as planar bitplanes ---- */
function framePlanes(t) {
  const planes = [];
  for (let pl = 0; pl < PLANES; pl++) {
    const rows = Buffer.alloc(rowBytes * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        /* moving bars: each plane shows a different band walking right */
        const xr = (x + t * 3 + pl * 7) % W;
        const on = xr < 10 && y > 8 + pl * 6 && y < 34 + pl * 3;
        if (on) rows[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    planes.push(rows);
  }
  return planes;
}

function packBits(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    let run = 1;
    while (i + run < src.length && run < 128 && src[i + run] === src[i]) run++;
    if (run > 1) { out.push(257 - run, src[i]); i += run; }
    else {
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

/* ---- method 5 encoder: diff two planar frames, emit DLTA ---- */
function encodeDLTA5(prev, next) {
  const planeStreams = [];
  for (let pl = 0; pl < PLANES; pl++) {
    const ops = [];
    for (let col = 0; col < rowBytes; col++) {
      const colOps = [];
      let opCount = 0;              // OPS, not bytes — a uniq op is 1 op with n data bytes
      let y = 0;
      while (y < H) {
        /* is this byte row identical in both frames? */
        const a = prev[pl][y * rowBytes + col];
        const b = next[pl][y * rowBytes + col];
        if (a === b) {
          /* gather a skip run, clamped to the bottom of this column */
          let n = 0;
          while (y + n < H && n < 127 &&
                 prev[pl][(y + n) * rowBytes + col] === next[pl][(y + n) * rowBytes + col]) n++;
          colOps.push(n);                       // skip op, high bit clear
          opCount++;
          y += n;
        } else {
          /* gather a literal (uniq) run while bytes keep differing */
          let n = 0;
          const bytes = [];
          while (y + n < H && n < 127 &&
                 prev[pl][(y + n) * rowBytes + col] !== next[pl][(y + n) * rowBytes + col]) {
            bytes.push(next[pl][(y + n) * rowBytes + col]);
            n++;
          }
          colOps.push(0x80 | n);
          opCount++;
          for (const v of bytes) colOps.push(v);
          y += n;
        }
      }
      /* Every column emits its own op-count followed by its ops. The count is
         the number of OPERATIONS, not bytes: `uniq 25` is one op followed by
         25 data bytes. Writing the byte length here makes a correct decoder
         run off the end of the column and corrupt the frame. */
      if (opCount) ops.push(opCount, ...colOps);
      else ops.push(0);
    }
    planeStreams.push(Buffer.from(ops));
  }

  /* 16 pointers: 8 plane pointers then 8 unused */
  const headerSize = 16 * 4;
  const pointers = [];
  let cursor = headerSize;
  const blobs = [];
  for (let pl = 0; pl < 8; pl++) {
    if (pl < PLANES && planeStreams[pl].length) {
      pointers.push(cursor);
      blobs.push(planeStreams[pl]);
      cursor += planeStreams[pl].length;
      if (cursor & 1) { blobs.push(Buffer.alloc(1)); cursor++; }
    } else {
      pointers.push(0);
    }
  }
  for (let k = 0; k < 8; k++) pointers.push(0);      // unused in method 5

  const head = Buffer.alloc(headerSize);
  pointers.forEach((p, i) => head.writeUInt32BE(p, i * 4));
  return Buffer.concat([head, ...blobs]);
}

function anhd(op, reltime) {
  const b = Buffer.alloc(32);
  b[0] = op;                         // operation
  b[1] = 0;                          // mask
  b.writeUInt16BE(W, 2); b.writeUInt16BE(H, 4);
  b.writeUInt32BE(0, 8);             // abstime
  b.writeUInt32BE(reltime, 12);      // reltime, jiffies
  b[16] = 0; b[17] = 0;
  b.writeUInt32BE(0, 18);            // bits
  return b;
}

/* ---- palette ---- */
const cmap = Buffer.alloc(16 * 3);
for (let i = 0; i < 16; i++) {
  cmap[i*3] = (i * 47) & 0xFF; cmap[i*3+1] = (i * 91) & 0xFF; cmap[i*3+2] = (i * 23) & 0xFF;
}
const bmhd = (() => {
  const b = Buffer.alloc(20);
  b.writeUInt16BE(W, 0); b.writeUInt16BE(H, 2);
  b[8] = PLANES; b[9] = 0; b[10] = 1; b[11] = 0;
  b.writeUInt16BE(1, 12); b[14] = 1; b[15] = 1;
  b.writeUInt16BE(W, 16); b.writeUInt16BE(H, 18);
  return b;
})();

const NF = 8;
let prev = framePlanes(0);
const dirFrames = [];
fs.mkdirSync(OUT, { recursive: true });

/* frame 0: full ILBM */
const f0planes = framePlanes(0);
const f0body = packBits(Buffer.concat(f0planes));
const f0 = form('ILBM', [chunk('BMHD', bmhd), chunk('CMAP', cmap), chunk('BODY', f0body)]);
dirFrames.push(f0);

/* frames 1..N: ANHD + DLTA */
for (let t = 1; t < NF; t++) {
  const next = framePlanes(t);
  const dlta = encodeDLTA5(prev, next);
  dirFrames.push(form('ILBM', [chunk('ANHD', anhd(5, 6)), chunk('DLTA', dlta)]));
  prev = next;
}

const anim = form('ANIM', dirFrames);
fs.writeFileSync(path.join(OUT, 'walking-bars.anim'), anim);

/* expected: frame t as RGBA, computed directly from framePlanes */
const exp = [];
for (let t = 0; t < NF; t++) {
  const planes = framePlanes(t);
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let idx = 0;
    for (let pl = 0; pl < PLANES; pl++) {
      if ((planes[pl][y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1) idx |= (1 << pl);
    }
    const o = (y * W + x) * 4;
    px[o] = cmap[idx*3]; px[o+1] = cmap[idx*3+1]; px[o+2] = cmap[idx*3+2]; px[o+3] = 255;
  }
  exp.push(Array.from(px));
}
fs.writeFileSync(path.join(OUT, 'expected-anim.json'),
  JSON.stringify({ w: W, h: H, frames: exp }));
console.log('wrote walking-bars.anim —', NF, 'frames,', (anim.length/1024).toFixed(1) + ' KB');
