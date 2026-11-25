#!/usr/bin/env node
/* THE ATTIC — static ship gate.
   The privacy claim is the product, so it is enforced mechanically. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0, warn = 0;
const ok  = m => console.log('  \x1b[32mPASS\x1b[0m ' + m);
const bad = m => { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + m); };
const wrn = m => { warn++; console.log('  \x1b[33mWARN\x1b[0m ' + m); };

console.log('\nTHE ATTIC — ship gate\n');

/* ---------- required files ---------- */
for (const f of ['index.html', 'LICENSE', 'README.md', 'css/attic.css', 'js/app.js', 'js/sniff.js', 'js/decoders/ilbm.js', 'js/decoders/anim.js']) {
  existsSync(join(ROOT, f)) ? ok(f) : bad('missing ' + f);
}

/* ---------- the .kiro directory must be present and not ignored ---------- */
if (existsSync(join(ROOT, '.kiro'))) ok('.kiro present at repo root');
else bad('.kiro missing — required for submission');

if (existsSync(join(ROOT, '.gitignore'))) {
  const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  if (/^\s*\.kiro/m.test(gi)) bad('.kiro is gitignored — disqualifying');
  else ok('.kiro is not gitignored');
} else ok('no .gitignore — .kiro cannot be excluded');

/* ---------- every JS file must parse ---------- */
const dirs = ['js', 'js/decoders', 'tools', 'tests'];
let parsed = 0;
for (const d of dirs) {
  const full = join(ROOT, d);
  if (!existsSync(full)) continue;
  for (const f of readdirSync(full).filter(f => f.endsWith('.js'))) {
    const src = readFileSync(join(full, f), 'utf8');
    try { new Function(src.replace(/^#!.*/, '')); parsed++; }
    catch (e) { bad(`${d}/${f} does not parse — ${e.message}`); }
  }
}
ok(`${parsed} JS files parse`);

/* ---------- THE PRIVACY GATE ----------
   A single fetch() or XMLHttpRequest in shipped code would break the one
   promise the product makes. Allowed exception: the built-in sample, which
   is a relative same-origin file, listed explicitly below. */
const RUNTIME = ['js/app.js', 'js/sniff.js', 'js/decoders/pcx.js', 'js/decoders/tga.js', 'js/decoders/ilbm.js', 'js/decoders/anim.js'];
let netHits = 0;
for (const f of RUNTIME) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;                 // comments are fine
    if (/\bfetch\s*\(/.test(line) || /XMLHttpRequest/.test(line) || /WebSocket/.test(line) ||
        /navigator\.sendBeacon/.test(line) || /new Image\(\)/.test(line)) {
      if (f === 'js/app.js' && /fetch\('fixtures\//.test(line)) return;  // the local sample only
      netHits++;
      bad(`${f}:${i + 1} contains a network call — ${line.trim().slice(0, 70)}`);
    }
  });
}
if (!netHits) ok('no network calls in shipped code (privacy claim holds)');

/* ---------- no external assets ---------- */
for (const f of ['index.html', 'css/attic.css']) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  const ext = src.match(/https?:\/\/[^\s"'()]+/g) || [];
  const badUrls = ext.filter(u => !/^https?:\/\/(www\.)?(github|kiro)\b/.test(u) && !/w3\.org/.test(u));
  if (badUrls.length) wrn(`${f} references ${badUrls.length} external URL(s)`);
  else ok(`${f}: no external assets`);
}

/* ---------- decoders are proven ---------- */
import { execSync } from 'node:child_process';
try {
  const out = execSync('node tests/run.js', { cwd: ROOT, encoding: 'utf8' });
  const m = out.match(/(\d+) passed, (\d+) failed/);
  if (m && m[2] === '0') ok(`decoder conformance: ${m[1]} passed, 0 failed`);
  else bad('decoder conformance failed — run `node tests/run.js`');
} catch (e) {
  bad('decoder tests threw — run `node tests/run.js`');
}

/* ---------- no third-party trademarks in user-visible copy ---------- */
const VISIBLE = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const MARKS = ['Photoshop', 'Windows', 'Microsoft', 'Adobe', 'Paint Shop Pro', 'Deluxe Paint'];
const hits = MARKS.filter(m => new RegExp('\\b' + m + '\\b', 'i').test(VISIBLE));
hits.length ? bad('trademark in user-visible copy: ' + hits.join(', ')) : ok('no third-party trademarks in copy');

console.log(`\n  ${fail ? '\x1b[31m' : '\x1b[32m'}${fail} failed\x1b[0m, ${warn} warnings\n`);
process.exit(fail ? 1 : 0);
