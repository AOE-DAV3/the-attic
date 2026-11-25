# Product steering — The Attic

## What this is

A local file rescue tool. Drop in a file that modern software refuses to open; it identifies
the format from the bytes, decodes it, shows it, and exports a durable modern replacement.

## Non-negotiable constraints

1. **Nothing leaves the machine.** No upload, no telemetry, no network request at runtime.
   The privacy claim is the product. A single stray `fetch()` destroys it.
2. **Static only.** Plain files that run from `file://` and deploy to GitHub Pages unchanged.
   No build step, no bundler, no dependencies.
3. **Identify by bytes, never by extension.** Old files routinely carry the wrong extension
   because they were renamed by a program that guessed. Extension is a hint; content is truth.
4. **Fail loudly.** A decoder that cannot parse a file must throw with a readable message.
   Returning a blank canvas is worse than an error, because the user cannot tell corruption
   from an empty image.
5. **No silent data loss.** The export path must state the format it is producing and whether
   it is lossless. Never upscale or resample silently.

## Tone

The interface is an attic: dust, candle-light, things re-emerging from the dark. Atmosphere is
carried by typography, light and motion — never by costuming that gets in the way of the tool
working fast.

## Architecture

- `js/decoders/*.js` — one file per format, pure functions: bytes in, RGBA out. No DOM access.
- `js/sniff.js` — format identification from magic bytes and structural plausibility.
- `js/export.js` — canvas → PNG/JPEG, with a stated honesty about lossiness.
- `js/app.js` — drag, drop, decode, display, export. The only file that touches the DOM.
- `tests/run.js` — conformance tests. Must pass before any commit.
