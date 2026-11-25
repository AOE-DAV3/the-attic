/* ============================================================
   Format identification from content, never from filename.

   Old files habitually carry the wrong extension — renamed by a
   program that guessed, or by a user who did not care. Trusting
   the extension is how converters show someone a black square.
   ============================================================ */
(function (root) {
  'use strict';

  function has(bytes, offset, str) {
    if (bytes.length < offset + str.length) return false;
    for (var i = 0; i < str.length; i++) {
      if (bytes[offset + i] !== str.charCodeAt(i)) return false;
    }
    return true;
  }

  /* Each probe returns a confidence 0..1.
     1.0 = unambiguous magic number. <1 = structural guess. */
  var PROBES = [
    {
      id: 'pcx', label: 'PCX', ext: 'pcx',
      test: function (b) {
        if (b.length < 129 || b[0] !== 0x0A) return 0;
        var enc = b[2], bpp = b[3], planes = b[65];
        if (enc !== 1 && enc !== 0) return 0;
        if ([1, 2, 4, 8].indexOf(bpp) < 0) return 0;
        if ([1, 3, 4].indexOf(planes) < 0) return 0;
        var w = (b[8] | (b[9] << 8)) - (b[4] | (b[5] << 8)) + 1;
        var h = (b[10] | (b[11] << 8)) - (b[6] | (b[7] << 8)) + 1;
        if (w <= 0 || h <= 0 || w > 8192 || h > 8192) return 0;
        return 0.95;
      }
    },
    {
      /* ANIM must be probed BEFORE ILBM: both start with FORM and a plain
         ILBM check would never match an animation anyway, but ordering it
         first keeps the intent obvious. */
      id: 'anim', label: 'IFF ANIM', ext: 'anim',
      test: function (b) {
        if (!has(b, 0, 'FORM')) return 0;
        return has(b, 8, 'ANIM') ? 1.0 : 0;
      }
    },
    {
      id: 'ilbm', label: 'IFF ILBM', ext: 'iff',
      test: function (b) {
        if (!has(b, 0, 'FORM')) return 0;
        if (has(b, 8, 'ILBM') || has(b, 8, 'PBM ')) return 1.0;
        return 0;
      }
    },
    {
      id: 'png', label: 'PNG', ext: 'png',
      test: function (b) { return has(b, 1, 'PNG') && b[0] === 0x89 ? 1.0 : 0; }
    },
    {
      id: 'jpeg', label: 'JPEG', ext: 'jpg',
      test: function (b) { return (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) ? 1.0 : 0; }
    },
    {
      id: 'gif', label: 'GIF', ext: 'gif',
      test: function (b) { return has(b, 0, 'GIF87a') || has(b, 0, 'GIF89a') ? 1.0 : 0; }
    },
    {
      id: 'bmp', label: 'BMP', ext: 'bmp',
      test: function (b) {
        if (!has(b, 0, 'BM') || b.length < 26) return 0;
        var w = b[18] | (b[19] << 8) | (b[20] << 16) | (b[21] << 24);
        var h = b[22] | (b[23] << 8) | (b[24] << 16) | (b[25] << 24);
        return (w > 0 && w < 40000) ? 0.9 : 0;
      }
    },
    {
      id: 'tga', label: 'TGA', ext: 'tga',
      test: function (b) {
        if (root.TGA && root.TGA.sniff && root.TGA.sniff(b)) return 0.75;
        return 0;
      }
    },
    {
      id: 'mod', label: 'Amiga MOD', ext: 'mod',
      test: function (b) {
        /* A MOD has 20 bytes at offset 1080..1083 that must look like a
           module title or be blank, plus a sane sample table at 20.. */
        if (b.length < 1084) return 0;
        var sig = String.fromCharCode(b[1080], b[1081], b[1082], b[1083]);
        if (/^(M\.K\.|M!K!|FLT4|FLT8|4CHN|6CHN|8CHN|OKTA|CD81)$/.test(sig)) return 1.0;
        /* many early MODs have no signature; validate the sample table instead */
        var total = 0;
        for (var i = 0; i < 31; i++) {
          var o = 20 + i * 30;
          var len = ((b[o + 22] << 8) | b[o + 23]) * 2;
          if (len < 0 || len > 0xFFFF) return 0;
          total += len;
        }
        var songLen = b[950];
        if (songLen < 1 || songLen > 128) return 0;
        return 0.45;
      }
    },
    {
      id: 'wav', label: 'WAV', ext: 'wav',
      test: function (b) { return has(b, 0, 'RIFF') && has(b, 8, 'WAVE') ? 1.0 : 0; }
    }
  ];

  function sniff(bytes) {
    var best = null;
    for (var i = 0; i < PROBES.length; i++) {
      var conf = 0;
      try { conf = PROBES[i].test(bytes) || 0; } catch (e) { conf = 0; }
      if (conf > 0 && (!best || conf > best.confidence)) {
        best = { id: PROBES[i].id, label: PROBES[i].label, ext: PROBES[i].ext, confidence: conf };
      }
    }
    return best;
  }

  root.Sniff = { sniff: sniff, probes: PROBES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Sniff;
})(typeof window !== 'undefined' ? window : globalThis);
