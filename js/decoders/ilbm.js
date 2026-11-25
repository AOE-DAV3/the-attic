/* ============================================================
   ILBM decoder — InterLeaved BitMap (Electronic Arts IFF, 1985)
   The image format of the Amiga: Deluxe Paint, DPaint animations,
   and most art that survived from that era.

   References:
     - "EA IFF 85" Standard for Interchange Format Files
     - "ILBM" IFF Interleaved Bitmap
     - Amiga Hardware Reference Manual (HAM / Extra-Half-Brite)

   An IFF file is a FORM containing typed chunks. We read BMHD
   (header), CMAP (palette), CAMG (display mode) and BODY (pixels).
   ============================================================ */
(function (root) {
  'use strict';

  function u32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function u16(b, o) { return (b[o] << 8) | b[o + 1]; }
  function tag(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }

  /* ---- ByteRun1 (PackBits) — the IFF run-length scheme ----
     b < 128  -> copy the next b+1 bytes literally
     b > 128  -> repeat the next byte (257 - b) times
     b == 128 -> no operation

     IMPORTANT: the BODY is ONE continuous stream. A run may be longer than the
     bytes left in the current scanline's bitplane and still have to continue
     into the next plane. So this reader carries partial-run state across calls
     rather than treating each plane as an independent stream. Getting this
     wrong silently desynchronises every plane after the first. */
  function StreamReader(src) {
    this.src = src;
    this.i = 0;
    this.remaining = 0;   // bytes still owed from the current run
    this.value = 0;       // the byte that run repeats
    this.literal = false; // is the current run a literal copy?
  }

  StreamReader.prototype.next = function () {
    if (this.remaining > 0) {
      this.remaining--;
      if (this.literal) {
        return this.i < this.src.length ? this.src[this.i++] : 0;
      }
      return this.value;
    }
    if (this.i >= this.src.length) return 0;

    var c = this.src[this.i++];
    if (c < 128) {
      this.literal = true;
      this.remaining = c;                 // plus the byte we return now = c+1
      return this.i < this.src.length ? this.src[this.i++] : 0;
    } else if (c > 128) {
      this.literal = false;
      this.remaining = 256 - c;            // plus the byte we return now = 257-c
      this.value = this.i < this.src.length ? this.src[this.i++] : 0;
      return this.value;
    }
    return this.next();                   // c === 128 is a NOP
  };

  StreamReader.prototype.readInto = function (out, n) {
    for (var k = 0; k < n; k++) out[k] = this.next();
    return out;
  };
  /* true once the underlying data is exhausted mid-run */
  StreamReader.prototype.exhausted = function () {
    return this.i >= this.src.length && this.remaining === 0;
  };

  function readChunks(bytes) {
    if (bytes.length < 12) throw new Error('not an IFF file');
    if (tag(bytes, 0, 4) !== 'FORM') throw new Error('missing FORM header — not an IFF file');
    var formType = tag(bytes, 8, 4);
    if (formType !== 'ILBM' && formType !== 'PBM ') {
      throw new Error('IFF form "' + formType + '" is not a bitmap');
    }

    var out = { form: formType, BMHD: null, CMAP: null, CAMG: null, BODY: null };
    var pos = 12;
    while (pos + 8 <= bytes.length) {
      var id = tag(bytes, pos, 4);
      var len = u32(bytes, pos + 4);
      var start = pos + 8;
      var end = start + len;
      if (end > bytes.length) end = bytes.length;          // tolerate truncation
      if (id === 'BMHD') out.BMHD = bytes.subarray(start, end);
      else if (id === 'CMAP') out.CMAP = bytes.subarray(start, end);
      else if (id === 'CAMG') out.CAMG = bytes.subarray(start, end);
      else if (id === 'BODY') out.BODY = bytes.subarray(start, end);
      pos = start + len + (len & 1);                       // chunks are word-aligned
    }
    return out;
  }

  function decode(bytes) {
    var f = readChunks(bytes);
    if (!f.BMHD || f.BMHD.length < 20) throw new Error('ILBM has no BMHD header');
    if (!f.BODY) throw new Error('ILBM has no BODY chunk');

    var h = f.BMHD;
    var width  = u16(h, 0);
    var height = u16(h, 2);
    var nPlanes = h[8];
    var masking = h[9];
    var compression = h[10];

    if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
      throw new Error('ILBM has implausible dimensions (' + width + 'x' + height + ')');
    }
    if (nPlanes < 1 || nPlanes > 8) {
      throw new Error('ILBM uses ' + nPlanes + ' bitplanes (only 1–8 supported)');
    }

    /* ---- palette ---- */
    var cmapEntries = f.CMAP ? Math.floor(f.CMAP.length / 3) : 0;
    var palette = new Uint8Array(Math.max(cmapEntries, 1) * 3);
    for (var c = 0; c < cmapEntries; c++) {
      palette[c * 3]     = f.CMAP[c * 3];
      palette[c * 3 + 1] = f.CMAP[c * 3 + 1];
      palette[c * 3 + 2] = f.CMAP[c * 3 + 2];
    }

    /* ---- Amiga display modes from CAMG ---- */
    var camg = f.CAMG && f.CAMG.length >= 4 ? u32(f.CAMG, 0) : 0;
    var isHAM  = (nPlanes === 6 || nPlanes === 8) && (camg & 0x800) !== 0;
    var isEHB  = nPlanes === 6 && (camg & 0x80) !== 0 && !isHAM;

    /* ---- geometry ---- */
    var rowBytes = ((width + 15) >> 4) << 1;               /* 16-bit aligned */
    var storedPlanes = nPlanes + (masking === 1 ? 1 : 0);
    var body = f.BODY;
    var p = { i: 0 };

    var planeRow = new Uint8Array(rowBytes);
    var stream = compression === 1 ? new StreamReader(body) : null;
    var rawPos = 0;
    var rgba = new Uint8ClampedArray(width * height * 4);

    /* HAM carries colour across the row, so it starts fresh per scanline */
    var hamR = 0, hamG = 0, hamB = 0;

    var halfBrite = function (i) {                          /* EHB: entries 32–63 are half of 0–31 */
      var base = i & 31;
      var r = palette[base * 3], g = palette[base * 3 + 1], b = palette[base * 3 + 2];
      if (i & 32) { r >>= 1; g >>= 1; b >>= 1; }
      return [r, g, b];
    };

    for (var y = 0; y < height; y++) {
      if (isHAM) { hamR = hamG = hamB = 0; }

      /* The alpha byte doubles as scratch for the colour index while the
         bitplanes are being assembled, so it MUST be cleared for this row.
         Leaving last row's value in place makes every `|=` a no-op. */
      for (var clr = 0; clr < width; clr++) rgba[(y * width + clr) * 4 + 3] = 0;

      for (var pl = 0; pl < storedPlanes; pl++) {
        planeRow.fill(0);
        if (compression === 1) {
          stream.readInto(planeRow, rowBytes);
          if (stream.exhausted() && (y < height - 1 || pl < storedPlanes - 1)) {
            throw new Error('ILBM is truncated — compressed data ended at row ' + (y + 1) +
                            ' of ' + height);
          }
        } else {
          if (rawPos + rowBytes > body.length) {
            throw new Error('ILBM is truncated — expected ' + (rowBytes * height * storedPlanes) +
                            ' bytes of pixel data, found ' + body.length);
          }
          for (var q = 0; q < rowBytes; q++) planeRow[q] = body[rawPos + q];
          rawPos += rowBytes;
        }

        /* first nPlanes rows feed the colour index; the extra row is the mask */
        if (pl < nPlanes) {
          for (var x = 0; x < width; x++) {
            var bit = 7 - (x & 7);
            var byteVal = planeRow[x >> 3];
            if ((byteVal >> bit) & 1) {
              /* accumulate the index in the low bits of the alpha slot as scratch */
              rgba[(y * width + x) * 4 + 3] |= (1 << pl);
            }
          }
        } else {
          /* mask plane: 1 = opaque */
          for (var x2 = 0; x2 < width; x2++) {
            var bit2 = 7 - (x2 & 7);
            var opaque = (planeRow[x2 >> 3] >> bit2) & 1;
            if (!opaque) {
              var oi = (y * width + x2) * 4 + 3;
              rgba[oi] = 0;
            }
          }
        }
      }

      /* ---- turn the assembled index into colour ---- */
      for (var px = 0; px < width; px++) {
        var o = (y * width + px) * 4;
        var idx = rgba[o + 3] & (nPlanes >= 8 ? 0xFF : (1 << nPlanes) - 1);
        var r, g, b, a = 255;

        if (isHAM) {
          var ctrl = idx & 3;
          var data = idx >> 2;                            /* 4 bits (HAM6) or 6 bits (HAM8) */
          if (ctrl === 0) {                               /* set from the palette */
            var pi = data % cmapEntries;
            hamR = palette[pi * 3]; hamG = palette[pi * 3 + 1]; hamB = palette[pi * 3 + 2];
          } else {
            var v = nPlanes === 8 ? Math.round(data * 255 / 63) : data * 17;
            if (ctrl === 1) hamB = v;                     /* modify blue  */
            else if (ctrl === 2) hamR = v;                /* modify red   */
            else hamG = v;                                /* modify green */
          }
          r = hamR; g = hamG; b = hamB;
        } else if (isEHB) {
          var e = halfBrite(idx);
          r = e[0]; g = e[1]; b = e[2];
        } else {
          var ci = idx % Math.max(cmapEntries, 1);
          r = palette[ci * 3]; g = palette[ci * 3 + 1]; b = palette[ci * 3 + 2];
        }

        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
        if (masking === 1) { if (rgba[o + 3] !== 0) rgba[o + 3] = 255; }
        else rgba[o + 3] = a;
      }
    }

    return {
      width: width, height: height, rgba: rgba,
      meta: {
        bitplanes: nPlanes,
        palette: cmapEntries,
        compressed: compression === 1,
        mode: isHAM ? 'HAM' : (isEHB ? 'Extra-Half-Brite' : 'standard'),
        masked: masking === 1
      }
    };
  }

  function sniff(b) {
    if (b.length < 12) return false;
    if (tag(b, 0, 4) !== 'FORM') return false;
    var t = tag(b, 8, 4);
    return t === 'ILBM' || t === 'PBM ';
  }

  root.ILBM = { decode: decode, sniff: sniff, ext: 'iff', name: 'IFF ILBM · Amiga' };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ILBM;
})(typeof window !== 'undefined' ? window : globalThis);
