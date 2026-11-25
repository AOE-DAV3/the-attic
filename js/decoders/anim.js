/* ============================================================
   ANIM decoder — IFF CEL animations (Electronic Arts, 1985)
   The format of Amiga animation: a keyframe followed by a chain of
   delta frames, usually byte-vertical run-length encoded (method 5,
   Jim Kent's scheme).

   Structure:
     FORM ANIM
       FORM ILBM        frame 0 — a normal image, BMHD + CMAP + BODY
       FORM ILBM        frame 1 — ANHD + DLTA
       FORM ILBM        frame 2 — ANHD + DLTA
       ...

   Two things that are easy to get wrong and are handled explicitly:

   1. The DLTA chunk begins with SIXTEEN big-endian long pointers. The
      first eight point at the opcode/data streams for up to eight
      bitplanes. The second eight are unused in method 5 but are still
      present. Reading only eight shifts every pointer.

   2. Intra-column skip ops count ROWS, not bytes. The destination
      advances by `skip * rowBytes` where rowBytes is the 16-bit aligned
      scanline length. Treating it as bytes produces garbage.

   Reference: "ANIM IFF CEL Animations", AmigaOS Documentation Wiki,
   appendix on method 5 (Jim Kent's skip.c / unvscomp).
   ============================================================ */
(function (root) {
  'use strict';

  function u32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
  function u16(b, o) { return (b[o] << 8) | b[o + 1]; }
  function tag(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }

  /* ---- ByteRun1 for the keyframe BODY ---- */
  function StreamReader(src) {
    this.src = src; this.i = 0; this.remaining = 0; this.value = 0; this.literal = false;
  }
  StreamReader.prototype.next = function () {
    if (this.remaining > 0) {
      this.remaining--;
      if (this.literal) return this.i < this.src.length ? this.src[this.i++] : 0;
      return this.value;
    }
    if (this.i >= this.src.length) return 0;
    var c = this.src[this.i++];
    if (c < 128) {
      this.literal = true; this.remaining = c;
      return this.i < this.src.length ? this.src[this.i++] : 0;
    } else if (c > 128) {
      this.literal = false; this.remaining = 256 - c;
      this.value = this.i < this.src.length ? this.src[this.i++] : 0;
      return this.value;
    }
    return this.next();
  };

  /* ---- walk chunks of one FORM at `base` (base points at 'FORM') ---- */
  function walkForm(bytes, base) {
    var out = { chunks: {}, subForms: [] };
    var size = u32(bytes, base + 4);
    var pos = base + 12;
    var end = Math.min(base + 8 + size, bytes.length);
    while (pos + 8 <= end) {
      var id = tag(bytes, pos, 4);
      var len = u32(bytes, pos + 4);
      var dataStart = pos + 8;
      var dataEnd = Math.min(dataStart + len, bytes.length);
      if (id === 'FORM') {
        out.subForms.push(dataStart - 4);          // points at the nested 'FORM'
      } else if (!(id in out.chunks)) {
        out.chunks[id] = bytes.subarray(dataStart, dataEnd);
      }
      pos = dataStart + len + (len & 1);
    }
    return out;
  }

  /* ---- apply a method-5 DLTA to a planar bitmap in place ----
     A bitplane is treated as a grid of vertical columns, each one byte wide
     and `height` rows tall. Every column starts with an op-count; zero means
     nothing changed there. The ops then walk down that column:
       skip  : b, high bit clear, non-zero -> advance b ROWS
       uniq  : 0x80|n, then n literal bytes copied down the column
       same  : 0, count, value -> repeat value for count rows
     Row advance is `rowBytes` in the destination, not one byte. */
  function applyDLTA5(dlta, bitmap, nPlanes, rowBytes, height) {
    if (dlta.length < 64) throw new Error('DLTA chunk is too small to hold its 16 pointers');

    for (var pl = 0; pl < nPlanes; pl++) {
      var start = u32(dlta, pl * 4);
      if (!start) continue;                       // no changes in this plane
      var base = pl * rowBytes * height;
      var i = start;
      var col = 0;

      while (i < dlta.length && col < rowBytes) {
        var opCount = dlta[i++];
        if (opCount === 0) { col++; continue; }   // column unchanged

        var row = 0;
        var ops = 0;
        while (ops < opCount && i < dlta.length) {
          var b = dlta[i++];
          ops++;

          if (b === 0) {
            var count = dlta[i++];
            var val = dlta[i++];
            for (var r = 0; r < count; r++) {
              if (row < height) bitmap[base + row * rowBytes + col] = val;
              row++;
            }
          } else if (b & 0x80) {
            var n = b & 0x7F;
            for (var k = 0; k < n && i < dlta.length; k++) {
              if (row < height) bitmap[base + row * rowBytes + col] = dlta[i];
              i++;
              row++;
            }
          } else {
            row += b;                              // skip rows, not bytes
          }
        }
        col++;
      }
    }
  }

  function decodeAll(bytes) {
    if (bytes.length < 12) throw new Error('not an IFF file');
    if (tag(bytes, 0, 4) !== 'FORM') throw new Error('missing FORM header');
    if (tag(bytes, 8, 4) !== 'ANIM') throw new Error('IFF form "' + tag(bytes, 8, 4) + '" is not an animation');

    var top = walkForm(bytes, 0);
    var frames = [];
    var bmhd = null, firstCMAP = null;

    /* first frame is the top-level FORM body itself */
    var pos = 12;
    var end = Math.min(8 + u32(bytes, 4), bytes.length);
    var cur = null;

    while (pos + 8 <= end) {
      var id = tag(bytes, pos, 4);
      var len = u32(bytes, pos + 4);
      if (id === 'FORM') {
        var f = walkForm(bytes, pos);
        if (!bmhd && f.chunks.BMHD) {
          bmhd = f.chunks.BMHD;
          if (f.chunks.CMAP) firstCMAP = f.chunks.CMAP;
        } else if (f.chunks.CMAP) {
          firstCMAP = f.chunks.CMAP;               // palette update applies onward
        }
        frames.push(f);
        pos = pos + 8 + len + (len & 1);
      } else {
        pos = pos + 8 + len + (len & 1);
      }
    }

    if (!bmhd) throw new Error('ANIM has no BMHD in its first frame');
    if (!frames.length) throw new Error('ANIM contains no frames');

    var width = u16(bmhd, 0);
    var height = u16(bmhd, 2);
    var nPlanes = bmhd[8];
    var rowBytes = ((width + 15) >> 4) << 1;

    if (width <= 0 || height <= 0 || width > 8192 || height > 8192) {
      throw new Error('ANIM has implausible dimensions (' + width + 'x' + height + ')');
    }

    /* ---- decode frame 0 into a planar buffer ---- */
    var planar = new Uint8Array(nPlanes * rowBytes * height);
    var f0 = frames[0];
    if (!f0.chunks.BODY) throw new Error('ANIM first frame has no BODY');
    var body = f0.chunks.BODY;
    var comp = bmhd[10];
    if (comp === 1) {
      var rd = new StreamReader(body);
      for (var q = 0; q < planar.length; q++) planar[q] = rd.next();
    } else {
      planar.set(body.subarray(0, Math.min(body.length, planar.length)));
    }

    /* ---- walk the delta chain, keeping every frame's planar state ---- */
    var planarFrames = [planar.slice()];
    var relTimes = [];
    var anhd0 = f0.chunks.ANHD;
    relTimes.push(anhd0 && anhd0.length >= 20 ? u32(anhd0, 12) : 4);

    for (var fi = 1; fi < frames.length; fi++) {
      var fr = frames[fi];
      var anhd = fr.chunks.ANHD;
      var op = anhd ? anhd[0] : 5;
      var rel = anhd && anhd.length >= 20 ? u32(anhd, 12) : 4;
      if (rel === 0) rel = 1;
      relTimes.push(rel);

      if (op === 0) {
        /* full replacement frame */
        var nb = fr.chunks.BODY || fr.chunks.DLTA;
        if (!nb) throw new Error('frame ' + fi + ' is a keyframe with no body');
        var np = new Uint8Array(nPlanes * rowBytes * height);
        var r2 = new StreamReader(nb);
        for (var q2 = 0; q2 < np.length; q2++) np[q2] = r2.next();
        planar = np;
      } else if (op === 5) {
        if (!fr.chunks.DLTA) throw new Error('frame ' + fi + ' uses method 5 but has no DLTA');
        applyDLTA5(fr.chunks.DLTA, planar, nPlanes, rowBytes, height);
      } else {
        throw new Error('ANIM frame ' + fi + ' uses delta method ' + op +
                        ' — this build supports 0 (keyframe) and 5 (byte-vertical)');
      }
      planarFrames.push(planar.slice());
    }

    /* ---- palette ---- */
    var camg = 0;
    var camgChunk = f0.chunks.CAMG;
    if (camgChunk && camgChunk.length >= 4) camg = u32(camgChunk, 0);
    var isHAM = (nPlanes === 6 || nPlanes === 8) && (camg & 0x800) !== 0;
    var isEHB = nPlanes === 6 && (camg & 0x80) !== 0 && !isHAM;
    var cmapEntries = firstCMAP ? Math.floor(firstCMAP.length / 3) : 0;
    var palette = new Uint8Array(cmapEntries * 3);
    for (var c = 0; c < cmapEntries; c++) {
      palette[c * 3] = firstCMAP[c * 3];
      palette[c * 3 + 1] = firstCMAP[c * 3 + 1];
      palette[c * 3 + 2] = firstCMAP[c * 3 + 2];
    }

    /* ---- planar -> RGBA for each frame ---- */
    var outFrames = [];
    for (var fi2 = 0; fi2 < planarFrames.length; fi2++) {
      var pbuf = planarFrames[fi2];
      var rgba = new Uint8ClampedArray(width * height * 4);
      var hamR = 0, hamG = 0, hamB = 0;
      for (var y = 0; y < height; y++) {
        if (isHAM) { hamR = hamG = hamB = 0; }
        for (var x = 0; x < width; x++) {
          var idx = 0;
          var bit = 7 - (x & 7);
          var bOff = x >> 3;
          for (var pl2 = 0; pl2 < nPlanes; pl2++) {
            if ((pbuf[pl2 * rowBytes * height + y * rowBytes + bOff] >> bit) & 1) idx |= (1 << pl2);
          }
          var o = (y * width + x) * 4;
          var r, g, b;
          if (isHAM) {
            var ctrl = idx & 3, data = idx >> 2;
            if (ctrl === 0) {
              var pi = data % Math.max(cmapEntries, 1);
              hamR = palette[pi * 3]; hamG = palette[pi * 3 + 1]; hamB = palette[pi * 3 + 2];
            } else {
              var v = nPlanes === 8 ? Math.round(data * 255 / 63) : data * 17;
              if (ctrl === 1) hamB = v; else if (ctrl === 2) hamR = v; else hamG = v;
            }
            r = hamR; g = hamG; b = hamB;
          } else if (isEHB) {
            var bi = idx & 31;
            r = palette[bi * 3]; g = palette[bi * 3 + 1]; b = palette[bi * 3 + 2];
            if (idx & 32) { r >>= 1; g >>= 1; b >>= 1; }
          } else {
            var ci = idx % Math.max(cmapEntries, 1);
            r = palette[ci * 3]; g = palette[ci * 3 + 1]; b = palette[ci * 3 + 2];
          }
          rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
        }
      }
      outFrames.push({ rgba: rgba, delay: relTimes[fi2] });
    }

    var totalJiffies = 0;
    for (var t = 0; t < relTimes.length; t++) totalJiffies += relTimes[t];

    return {
      width: width, height: height, frames: outFrames,
      meta: {
        frames: outFrames.length,
        bitplanes: nPlanes,
        mode: isHAM ? 'HAM' : (isEHB ? 'Extra-Half-Brite' : 'standard'),
        seconds: Math.round(totalJiffies / 60 * 10) / 10,
        fps: Math.round(60 / (totalJiffies / outFrames.length))
      }
    };
  }

  function sniff(b) {
    return b.length >= 12 && tag(b, 0, 4) === 'FORM' && tag(b, 8, 4) === 'ANIM';
  }

  root.ANIM = { decode: decodeAll, sniff: sniff, ext: 'anim', name: 'IFF ANIM · Amiga' };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ANIM;
})(typeof window !== 'undefined' ? window : globalThis);
