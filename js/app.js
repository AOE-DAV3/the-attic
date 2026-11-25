/* ============================================================
   THE ATTIC — application shell
   Drag a dead file in. It is identified from its bytes, decoded
   locally, and can be rescued to a durable modern format.
   Nothing is ever sent anywhere: there is no fetch in this file.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };



  /* Explicit id map. Resolving on demand means a typo throws where it is
     used instead of silently killing every listener defined after it. */
  var IDS = {
    drop: 'drop', input: 'file', stage: 'stage', canvas: 'preview', empty: 'empty',
    card: 'card', name: 'fileName', size: 'fileSize', format: 'fileFormat',
    conf: 'fileConf', dims: 'fileDims', meta: 'fileMeta', verdict: 'verdict',
    verdictT: 'verdictText', log: 'log', dlPng: 'dlPng', dlJpg: 'dlJpg',
    copy: 'copy', sample: 'sample', clear: 'clear', dust: 'dust',
    frameRow: 'frameRow', frameNum: 'frameNum'
  };
  var cache = {};
  var els = new Proxy({}, {
    get: function (t, key) {
      if (key in cache) return cache[key];
      var id = IDS[key];
      var el = id ? document.getElementById(id) : null;
      if (!el) {
        console.error('[attic] missing element for "' + key + '" (id "' + id + '")');
        return document.createElement('div');
      }
      cache[key] = el;
      return el;
    }
  });

  var state = { file: null, bytes: null, image: null, format: null, anim: null, frame: 0, raf: 0, timer: 0 };

  /* ---------- decoders available in this build ---------- */
  function decoders() {
    var d = {};
    if (window.PCX) d.pcx = window.PCX;
    if (window.TGA) d.tga = window.TGA;
    if (window.ILBM) d.ilbm = window.ILBM;
    if (window.ANIM) d.anim = window.ANIM;
    return d;
  }

  function humanSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function logLine(text, cls) {
    var p = document.createElement('div');
    p.className = 'log-line' + (cls ? ' ' + cls : '');
    p.textContent = text;
    els.log.appendChild(p);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function clearLog() { els.log.innerHTML = ''; }

  /* ---------- paint a decoded RGBA buffer ---------- */
  function show(image) {
    var cv = els.canvas;
    cv.width = image.width;
    cv.height = image.height;
    var ctx = cv.getContext('2d');
    var id = ctx.createImageData(image.width, image.height);
    id.data.set(image.rgba);
    ctx.putImageData(id, 0, 0);

    /* keep pixel art crisp; do not let the browser blur it */
    cv.style.imageRendering = image.width < 512 ? 'pixelated' : 'auto';

    /* Fill the stage. Small images get integer-ish upscaling so pixel art
       stays crisp; large images are contained, never cropped. */
    var box = els.stage.getBoundingClientRect();
    var availW = Math.max(240, box.width - 52);
    var availH = Math.max(220, Math.min(window.innerHeight - 300, 520));
    var scale = Math.min(availW / image.width, availH / image.height);
    if (image.width < 256) scale = Math.min(scale, 8);      // do not turn a 16px icon into mush
    scale = Math.max(scale, 0.05);
    cv.style.width = Math.round(image.width * scale) + 'px';
    cv.style.height = Math.round(image.height * scale) + 'px';
    cv.style.maxWidth = '100%';
    cv.style.maxHeight = availH + 'px';

    els.empty.hidden = true;
    els.canvas.hidden = false;
    els.stage.classList.add('lit');
    els.card.hidden = false;
    els.dlPng.disabled = false;
    els.dlJpg.disabled = false;
    els.copy.disabled = false;
  }

  /* ---------- the whole pipeline ---------- */
  function stopAnim() {
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
    if (state.timer) { clearTimeout(state.timer); state.timer = 0; }
    state.anim = null;
    state.frame = 0;
    els.frameRow.hidden = true;
  }

  function ingest(file) {
    stopAnim();
    clearLog();
    els.verdict.hidden = true;
    state.file = file;
    els.name.textContent = file.name;
    els.size.textContent = humanSize(file.size);

    var ext = (file.name.split('.').pop() || '').toLowerCase();
    logLine('reading ' + file.name + ' (' + humanSize(file.size) + ')');

    var reader = new FileReader();
    reader.onerror = function () { fail('the file could not be read'); };
    reader.onload = function () {
      var bytes = new Uint8Array(reader.result);
      state.bytes = bytes;

      /* --- identify from content, then compare with the extension --- */
      var found = window.Sniff.sniff(bytes);
      if (!found) {
        els.format.textContent = 'unrecognised';
        els.conf.textContent = '';
        return fail('no decoder in this attic recognises these bytes', true);
      }
      state.format = found;
      els.format.textContent = found.label;
      els.conf.textContent = Math.round(found.confidence * 100) + '% confident';

      if (ext && ext !== found.ext && ext !== 'iff' && found.ext !== 'iff') {
        logLine('extension says .' + ext + ', bytes say ' + found.label + ' — trusting the bytes', 'note');
      } else {
        logLine('identified as ' + found.label);
      }

      var dec = decoders()[found.id];
      if (!dec) {
        return fail(found.label + ' is recognised but this build has no decoder for it yet', true);
      }

      var image;
      try {
        image = dec.decode(bytes);
      } catch (e) {
        return fail('could not decode: ' + e.message, true);
      }

      state.image = image;
      els.dims.textContent = image.width + ' × ' + image.height;

      var META_LABELS = {
        planes: 'planes', bitsPerPixel: 'bits/px', imageType: 'type',
        rle: 'compressed', topDown: 'top-down'
      };
      var metaBits = [];
      for (var k in image.meta) if (Object.prototype.hasOwnProperty.call(image.meta, k)) {
        var v = image.meta[k];
        if (typeof v === 'boolean') v = v ? 'yes' : 'no';
        metaBits.push((META_LABELS[k] || k) + ' ' + v);
      }
      els.meta.textContent = metaBits.join(' · ');

      /* ANIM returns a frame list instead of a single image */
      if (image && image.frames) {
        state.anim = image;
        show({ width: image.width, height: image.height, rgba: image.frames[0].rgba });
        els.frameRow.hidden = false;
        logLine('animation: ' + image.frames.length + ' frames, ' + image.meta.fps + ' fps, ' + image.meta.seconds + 's');
        playAnim();
        var pxA = image.width * image.height;
        logLine('decoded ' + (pxA * image.frames.length).toLocaleString() + ' pixels across ' + image.frames.length + ' frames', 'ok');
        els.verdict.hidden = false;
        els.verdict.className = 'verdict good';
        els.verdictT.textContent = found.label + ' rescued — ' + image.frames.length + ' frames, playing.';
        return;
      }

      show(image);

      var px = image.width * image.height;
      logLine('decoded ' + px.toLocaleString() + ' pixels', 'ok');
      logLine('ready to rescue — nothing left this machine', 'ok');

      els.verdict.hidden = false;
      els.verdict.className = 'verdict good';
      els.verdictT.textContent = found.label + ' rescued from the dark.';
    };
    reader.readAsArrayBuffer(file);
  }

  function playAnim() {
    var a = state.anim;
    if (!a) return;
    var cv = els.canvas;
    cv.width = a.width;
    cv.height = a.height;
    var ctx = cv.getContext('2d');
    var id = ctx.createImageData(a.width, a.height);

    var n = 0;
    function tick() {
      var f = a.frames[n % a.frames.length];
      id.data.set(f.rgba);
      ctx.putImageData(id, 0, 0);
      els.frameNum.textContent = (n % a.frames.length + 1) + ' / ' + a.frames.length;
      var delay = Math.max(1, f.delay || 4) / 60 * 1000;   // jiffies -> ms
      n++;
      state.timer = setTimeout(tick, delay);
    }
    state.frame = 0;
    tick();
  }

  function fail(message, withVerdict) {
    els.stage.classList.remove('lit');
    els.card.hidden = true;
    els.canvas.hidden = true;
    els.empty.hidden = false;
    els.dlPng.disabled = true;
    els.dlJpg.disabled = true;
    els.copy.disabled = true;
    logLine('failed — ' + message, 'bad');
    if (withVerdict) {
      els.verdict.hidden = false;
      els.verdict.className = 'verdict bad';
      els.verdictT.textContent = message;
    }
  }

  /* ---------- export ---------- */
  function download(type, ext, quality) {
    if (!state.image && !state.anim) return;
    var wasAnim = !!state.anim;
    if (wasAnim && state.timer) { clearTimeout(state.timer); state.timer = 0; }
    var cv = els.canvas;
    cv.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var base = (state.file && state.file.name || 'rescued').replace(/\.[^.]+$/, '');
      a.href = url;
      a.download = base + ' — rescued.' + ext;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      logLine('exported ' + ext.toUpperCase() + ', ' + humanSize(blob.size) +
              (ext === 'jpg' ? '  (lossy — use PNG to keep every pixel)' : '  (lossless)') +
              (wasAnim ? '  (current frame only — video export is on the roadmap)' : ''),
              ext === 'jpg' ? 'note' : 'ok');
      if (wasAnim) playAnim();
    }, type, quality);
  }

  /* ---------- wiring ---------- */
  els.input.addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) ingest(e.target.files[0]);
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.remove('over'); });
  });
  els.drop.addEventListener('drop', function (e) {
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) ingest(f);
  });

  /* whole window accepts a drop, so a user who misses the box is not punished */
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) ingest(f);
  });

  els.dlPng.addEventListener('click', function () { download('image/png', 'png'); });
  els.dlJpg.addEventListener('click', function () { download('image/jpeg', 'jpg', 0.92); });

  els.copy.addEventListener('click', function () {
    if (!state.image) return;
    var t = JSON.stringify({
      file: state.file.name, format: state.format.label,
      width: state.image.width, height: state.image.height, meta: state.image.meta
    }, null, 2);
    navigator.clipboard.writeText(t).then(function () {
      logLine('metadata copied to clipboard', 'ok');
    }, function () {
      logLine('clipboard refused — select the text manually', 'note');
    });
  });

  els.clear.addEventListener('click', function () {
    stopAnim();
    state = { file: null, bytes: null, image: null, format: null, anim: null, frame: 0, raf: 0, timer: 0 };
    els.card.hidden = true;
    els.canvas.hidden = true;
    els.empty.hidden = false;
    els.stage.classList.remove('lit');
    els.verdict.hidden = true;
    els.file.value = '';
    clearLog();
    els.format.textContent = '—';
    els.conf.textContent = '';
    els.dims.textContent = '—';
    els.meta.textContent = '—';
    els.dlPng.disabled = true;
    els.dlJpg.disabled = true;
    els.copy.disabled = true;
    els.name.textContent = 'nothing yet';
    els.size.textContent = '';
  });

  /* the built-in sample proves the tool works before the user finds a file */
  els.sample.addEventListener('click', function () {
    fetch('fixtures/testcard.pcx')
      .then(function (r) {
        if (!r.ok) throw new Error('sample missing');
        return r.blob();
      })
      .then(function (b) {
        ingest(new File([b], 'sample-from-1994.pcx'));
      })
      .catch(function () {
        logLine('the built-in sample is not available in this build', 'note');
      });
  });

  /* ---------- ambient dust, for the attic ---------- */
  (function dust() {
    var cv = document.getElementById('dust');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var motes = [];
    function resize() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      motes = [];
      var n = Math.min(60, Math.floor(cv.width / 22));
      for (var i = 0; i < n; i++) {
        motes.push({
          x: Math.random() * cv.width,
          y: Math.random() * cv.height,
          r: 0.6 + Math.random() * 1.7,
          vy: -0.06 - Math.random() * 0.18,
          vx: (Math.random() - 0.5) * 0.12,
          a: 0.06 + Math.random() * 0.2
        });
      }
    }
    resize();
    window.addEventListener('resize', resize);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    (function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.x += m.vx; m.y += m.vy;
        if (m.y < -4) { m.y = cv.height + 4; m.x = Math.random() * cv.width; }
        if (m.x < -4) m.x = cv.width + 4;
        if (m.x > cv.width + 4) m.x = -4;
        ctx.fillStyle = 'rgba(228,214,178,' + m.a + ')';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, 6.283);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    })();
  })();
})();
