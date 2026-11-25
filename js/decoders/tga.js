/* ============================================================
   TGA decoder — Truevision Targa, 1984
   The texture format of a generation of DOS games and 3D
   modelling packages. Every mod archive is full of them.

   Reference: Truevision TGA File Format Specification v2.0.
   18-byte header, little-endian. Supports uncompressed and
   RLE truecolour, plus uncompressed colour-mapped and grey.
   Origin bit decides whether rows are stored bottom-up or top-down.
   ============================================================ */
(function (root) {
  'use strict';

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }

  function decode(bytes) {
    if (bytes.length < 18) throw new Error('not a TGA file');

    var idLen       = bytes[0];
    var cmapType    = bytes[1];
    var imageType   = bytes[2];
    var cmapStart   = u16(bytes, 3);
    var cmapLen     = u16(bytes, 5);
    var cmapDepth   = bytes[7];
    var width       = u16(bytes, 12);
    var height      = u16(bytes, 14);
    var pixelDepth  = bytes[16];
    var descriptor  = bytes[17];
    var topDown     = (descriptor & 0x20) !== 0;

    if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
      throw new Error('TGA has implausible dimensions (' + width + 'x' + height + ')');
    }

    var supported = { 1: 1, 2: 1, 3: 1, 9: 1, 10: 1, 11: 1 };
    if (!supported[imageType]) throw new Error('TGA image type ' + imageType + ' is not supported');
    var rle = imageType >= 9;
    var kind = imageType % 8 ? (imageType % 8) : 8;   // 1=cmap 2=truecolour 3=grey

    var p = 18 + idLen;

    /* ---- optional colour map ---- */
    var cmap = null;
    if (cmapType === 1) {
      var entryBytes = (cmapDepth + 7) >> 3;
      cmap = new Uint8Array(cmapLen * 4);
      for (var c = 0; c < cmapLen; c++) {
        var o = p + c * entryBytes;
        if (o + entryBytes > bytes.length) break;
        if (entryBytes === 2) {                       // 16-bit 5551
          var v = u16(bytes, o);
          cmap[c * 4]     = ((v >> 10) & 0x1F) * 255 / 31;
          cmap[c * 4 + 1] = ((v >> 5) & 0x1F) * 255 / 31;
          cmap[c * 4 + 2] = (v & 0x1F) * 255 / 31;
          cmap[c * 4 + 3] = (v & 0x8000) ? 255 : 255;
        } else if (entryBytes === 3) {
          cmap[c * 4] = bytes[o + 2]; cmap[c * 4 + 1] = bytes[o + 1]; cmap[c * 4 + 2] = bytes[o]; cmap[c * 4 + 3] = 255;
        } else {
          cmap[c * 4] = bytes[o + 2]; cmap[c * 4 + 1] = bytes[o + 1]; cmap[c * 4 + 2] = bytes[o]; cmap[c * 4 + 3] = bytes[o + 3];
        }
      }
      p += cmapLen * entryBytes;
    }

    var pxBytes = (pixelDepth + 7) >> 3;
    var total = width * height;
    var raw = new Uint8Array(total * pxBytes);

    /* ---- expand RLE if present ---- */
    if (rle) {
      var i = 0;
      while (i < total) {
        if (p >= bytes.length) {
          throw new Error('TGA RLE stream ended early — ' + i + ' of ' + total + ' pixels decoded');
        }
        var hdr = bytes[p++];
        var runLen = (hdr & 0x7F) + 1;
        if (hdr & 0x80) {                              // run-length packet
          for (var k = 0; k < runLen && i < total; k++) {
            for (var bb = 0; bb < pxBytes; bb++) raw[i * pxBytes + bb] = bytes[p + bb];
            i++;
          }
          p += pxBytes;
        } else {                                       // raw packet
          for (var k2 = 0; k2 < runLen && i < total; k2++) {
            for (var bb2 = 0; bb2 < pxBytes; bb2++) raw[i * pxBytes + bb2] = bytes[p + bb2];
            p += pxBytes; i++;
          }
        }
      }
    } else {
      var need = total * pxBytes;
      var have = Math.max(0, bytes.length - p);
      if (have < need) {
        /* A short file is CORRUPT, not a smaller image. Reporting success here
           would hand the user a picture with silently missing data. */
        throw new Error('TGA is truncated — header declares ' + width + 'x' + height +
                        ' (' + need + ' bytes of pixel data) but only ' + have + ' are present');
      }
      raw.set(bytes.subarray(p, p + need));
    }

    /* ---- unpack to RGBA, honouring the origin flag ---- */
    var rgba = new Uint8ClampedArray(total * 4);
    for (var y = 0; y < height; y++) {
      var srcRow = topDown ? y : (height - 1 - y);
      for (var x = 0; x < width; x++) {
        var si = (srcRow * width + x) * pxBytes;
        var di = (y * width + x) * 4;
        var r, g, b, a = 255;

        if (kind === 1) {
          var idx = pxBytes === 1 ? raw[si] : u16(raw, si);
          idx -= cmapStart;
          if (cmap && idx >= 0 && idx < cmapLen) {
            r = cmap[idx * 4]; g = cmap[idx * 4 + 1]; b = cmap[idx * 4 + 2]; a = cmap[idx * 4 + 3];
          } else { r = g = b = 0; }
        } else if (kind === 3) {
          r = g = b = raw[si];
          if (pxBytes === 2) a = raw[si + 1];
        } else {
          if (pxBytes === 4) { b = raw[si]; g = raw[si + 1]; r = raw[si + 2]; a = raw[si + 3]; }
          else if (pxBytes === 3) { b = raw[si]; g = raw[si + 1]; r = raw[si + 2]; }
          else if (pxBytes === 2) {
            var v2 = raw[si] | (raw[si + 1] << 8);
            b = (v2 & 0x1F) * 255 / 31;
            g = ((v2 >> 5) & 0x1F) * 255 / 31;
            r = ((v2 >> 10) & 0x1F) * 255 / 31;
            a = (v2 & 0x8000) ? 255 : 255;
          }
        }
        rgba[di] = r; rgba[di + 1] = g; rgba[di + 2] = b; rgba[di + 3] = a;
      }
    }

    return {
      width: width, height: height, rgba: rgba,
      meta: { imageType: imageType, rle: rle, bitsPerPixel: pixelDepth, topDown: topDown }
    };
  }

  /* TGA has no magic number at offset 0, so sniffing is by trailer
     ("TRUEVISION-XFILE") or by a header that only makes sense as TGA. */
  function sniff(bytes) {
    var n = bytes.length;
    if (n > 18) {
      var tail = String.fromCharCode.apply(null, bytes.subarray(Math.max(0, n - 26), n - 8));
      if (tail.indexOf('TRUEVISION-XFILE') >= 0) return true;
    }
    if (n < 18) return false;
    var type = bytes[2];
    if (![1, 2, 3, 9, 10, 11].includes(type)) return false;
    var w = bytes[12] | (bytes[13] << 8), h = bytes[14] | (bytes[15] << 8);
    var depth = bytes[16];
    if (![8, 15, 16, 24, 32].includes(depth)) return false;
    if (w === 0 || h === 0) return false;
    return true;
  }

  root.TGA = { decode: decode, sniff: sniff, ext: 'tga', name: 'TGA · Truevision Targa' };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TGA;
})(typeof window !== 'undefined' ? window : globalThis);
