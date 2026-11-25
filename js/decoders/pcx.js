/* ============================================================
   PCX decoder — ZSoft Paintbrush, 1985
   Still found on 1990s clip-art CDs, scanner output and DOS
   archives. Nothing modern will open it.

   Reference: ZSoft PCX File Format Technical Reference Manual, rev 5.
   Header is 128 bytes little-endian. Pixel data is RLE-encoded
   per scanline, per plane. 8bpp images carry a 768-byte VGA
   palette behind a 0x0C sentinel at the end of the file.
   ============================================================ */
(function (root) {
  'use strict';

  var PCX_MAGIC = 0x0A;

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }

  /* RLE: a byte with its top two bits set starts a run.
     count = low 6 bits, value = the next byte. */
  function rleLine(src, p, out, n) {
    var i = 0;
    while (i < n && p.i < src.length) {
      var b = src[p.i++];
      if ((b & 0xC0) === 0xC0) {
        var count = b & 0x3F;
        var val = src[p.i++];
        for (var k = 0; k < count && i < n; k++) out[i++] = val;
      } else {
        out[i++] = b;
      }
    }
    return i;                             // how many bytes were actually filled
  }

  function decode(bytes) {
    if (bytes.length < 128 || bytes[0] !== PCX_MAGIC) throw new Error('not a PCX file');

    var encoding  = bytes[2];
    var bitsPerPx = bytes[3];
    var width  = u16(bytes, 8) - u16(bytes, 4) + 1;
    var height = u16(bytes, 10) - u16(bytes, 6) + 1;
    var planes = bytes[65];
    var bytesPerLine = u16(bytes, 66);
    var paletteInfo  = u16(bytes, 68);

    if (width <= 0 || height <= 0 || width > 8192 || height > 8192) {
      throw new Error('PCX has implausible dimensions (' + width + 'x' + height + ')');
    }
    if (encoding !== 1) throw new Error('PCX uses an unsupported encoding');

    /* 256-colour palette: last 769 bytes, behind a 0x0C sentinel */
    var palette = null;
    var tail = bytes.length - 769;
    if (bitsPerPx === 8 && planes === 1 && tail > 128 && bytes[tail] === 0x0C) {
      palette = bytes.subarray(tail + 1, tail + 769);
    }

    var stride = bytesPerLine * planes;
    var line = new Uint8Array(stride);
    var p = { i: 128 };
    var rgba = new Uint8ClampedArray(width * height * 4);

    for (var y = 0; y < height; y++) {
      line.fill(0);
      var filled = rleLine(bytes, p, line, stride);
      if (filled < stride && y < height - 1) {
        /* a short line means the pixel stream ran out before the image did.
           Rendering the remainder as black would silently discard data. */
        throw new Error('PCX is truncated — pixel data ended at scanline ' + (y + 1) +
                        ' of ' + height);
      }

      for (var x = 0; x < width; x++) {
        var o = (y * width + x) * 4;
        var r, g, b;

        if (planes === 1 && bitsPerPx === 8) {
          var idx = line[x];
          if (palette) { r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2]; }
          else { r = g = b = idx; }
        } else if (planes === 3 && bitsPerPx === 8) {
          r = line[x]; g = line[bytesPerLine + x]; b = line[bytesPerLine * 2 + x];
        } else if (planes === 4 && bitsPerPx === 1) {
          /* planar 1-bit: one bit per plane, MSB is the leftmost pixel */
          var bi = x >> 3, bit = 7 - (x & 7);
          var i4 = 0;
          for (var pl = 0; pl < 4; pl++) i4 |= ((line[pl * bytesPerLine + bi] >> bit) & 1) << pl;
          r = (i4 & 8) ? 255 : 0;      // intensity / red
          g = (i4 & 4) ? 255 : 0;      // green
          b = (i4 & 2) ? 255 : 0;      // blue
          if (i4 & 1) { r = Math.min(255, r + 128); g = Math.min(255, g + 128); b = Math.min(255, b + 128); }
        } else if (planes === 1 && bitsPerPx === 1) {
          var b1 = 7 - (x & 7);
          var on = (line[x >> 3] >> b1) & 1;
          r = g = b = on ? 255 : 0;
        } else {
          throw new Error('PCX ' + bitsPerPx + 'bpp / ' + planes + ' plane variant is not supported');
        }
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
      }
    }
    return { width: width, height: height, rgba: rgba, meta: { planes: planes, bitsPerPixel: bitsPerPx } };
  }

  root.PCX = { decode: decode, magic: PCX_MAGIC, ext: 'pcx', name: 'PCX · ZSoft Paintbrush' };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PCX;
})(typeof window !== 'undefined' ? window : globalThis);
