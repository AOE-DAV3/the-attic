# Submission checklist — Kiroween 2026

Deadline: **Friday 4 December 2026, 2:00 PM PT** = 10:00 PM Lagos. Do not plan to the last hour.

---

## 1. Before you touch Kiro

- [ ] Claim the **4,000 Kiro credits** on the Devpost *Resources* tab — closes **1 December, 12:00 PM PT**
- [ ] Confirm the repo's first commit is **on or after 30 October 2026** (older work is ineligible)
- [ ] Confirm your student status if you are entering **Best Student Project**

## 2. Repository

- [ ] Public **GitHub** repo (not GitLab, not Bitbucket)
- [ ] `LICENSE` at root **and** visible in the About box → *Add license*
- [ ] `.kiro/` committed and visible in the file tree
- [ ] **No `.gitignore` rule matching `.kiro`** — this is listed as a possible disqualification
- [ ] `node tests/run.js` passes on a clean clone
- [ ] `node scripts/check.mjs` reports 0 failed
- [ ] README explains what it does and how to run it, in the first screen

Verify the two disqualification traps by hand:

```
git ls-files .kiro          # must list the spec, steering and hook files
git check-ignore .kiro      # must print nothing
```

## 3. Deployed app

- [ ] GitHub Pages enabled: **Settings → Pages → Deploy from branch → main / root**
- [ ] The live URL opens the app, not a 404
- [ ] Test from a **phone** as well as a desktop
- [ ] Download a PNG on the deployed URL and confirm it opens

## 4. Demo video — under 3:00, public on YouTube

Judges are not required to watch past three minutes, so the interesting thing must happen early.

| Time | Shot |
|---|---|
| 0:00–0:15 | The problem: open a `.pcx` in a normal browser. It fails. |
| 0:15–0:35 | Drop the same file into The Attic. It decodes. State that nothing was uploaded. |
| 0:35–1:00 | **The wrong-extension demo:** a TGA renamed `.PCX`. Show the log line *"extension says .pcx, bytes say TGA — trusting the bytes."* |
| 1:00–1:30 | The Amiga HAM sunset: 16 palette colours producing 47 on screen. |
| 1:30–2:00 | **The IFF ANIM** — an actual 1990 animation playing in the browser, frame counter running. |
| 2:00–2:25 | Rescue to PNG, then open the exported file somewhere else. Prove the loop closes. |
| 2:25–2:45 | The specs in `.kiro/`, the test suite running, the privacy gate failing on an injected `fetch`. |
| 2:45–3:00 | What is next; where the repo is. |

- [ ] Under 3:00
- [ ] Public on YouTube
- [ ] No third-party trademarks or copyrighted music
- [ ] Show it running on the device it was built for

## 5. Devpost form

- [ ] Category: **Resurrection**
- [ ] Repo URL, app URL, text description
- [ ] Write-up: `WRITEUP-KIRO.md` — **fill every `⟨TO FILL⟩` first**
- [ ] Optional: Social Blitz post with `#KiroweenHackathon26`

## 6. The honesty check — do this last, and mean it

- [ ] Every sentence in `WRITEUP-KIRO.md` §5 describes a session that actually happened
- [ ] No claim in the write-up is contradicted by the repo
- [ ] Anything you did not build is listed under "Not claimed" in the README
- [ ] If Kiro turned out to be less central than the write-up implies, say so — a specific,
      modest account of real tool usage reads better than a broad claim that a judge can
      disprove in thirty seconds by opening the repo

---

## Current state of this repo

| Item | State |
|---|---|
| Decoders | 4 — PCX, TGA, IFF ILBM (HAM6/HAM8, EHB, mask), IFF ANIM (method 5) |
| Tests | 18 assertions, 0 failing |
| Ship gate | 0 failed, 0 warnings |
| Network calls in shipped code | none, enforced by the gate |
| Specs in `.kiro` | 4 |
| Steering docs | 1 |
| Hooks | 2 |
| Known gaps | ANIM methods 7/8, no fixture for HAM8, no animation video export |
