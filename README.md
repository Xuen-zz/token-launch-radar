# Token Launch Radar

<!-- repository-badges -->
[![Rank](https://make.fun/badge/token-radar-01/Xuen-zz/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/Xuen-zz/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)
<!-- /repository-badges -->

![Make.fun competition](https://make.fun/badge/token-radar-01.svg)

An offline research desk for [Make.fun's token-radar-01](https://make.fun/bounty/token-radar-01).
It recomputes 192 ranked protocols from the official 758-protocol snapshot,
covers all 40 required watchlist entries, and separates seven records with
documented related assets from the default launch research list.

Use Node 22.18 or later. No package installation, network access or third-party
runtime dependency is needed. With the official kit unpacked next to your work:

```powershell
node main.ts --preview --input E:\Codex-Makefun\radar-kit-work\token-radar-01-kit\input\snapshot.json --output preview
```

Open `preview/dashboard/index.html` locally. It provides search, category, chain,
watchlist and evidence filters, sorting, paging, all protocol details, modeled
interaction costs and an editable break-even calculator. Expand Inspect validation
for matched model comparisons and cohort diagnostics. Sources are visible text
so that the rendered dashboard makes no network requests.

The conditional circulating-market-cap estimate uses the reviewed robust TVL
curve and regularized signals. The original and Theil–Sen models are tested on
the same 38 dated holdouts and 90 held-out token families. Value ranges describe
observed holdout residuals; rank bands describe 80 deterministic peer resamples.
They do not establish whether or when a token launches. Costs are explicit
scenarios; campaign eligibility and awards remain unverified.

The approved numerical, farm and evidence modules are reused unchanged under
`reference/`. This session wrote the entrypoint, interface and local tools.
See [PROVENANCE.md](PROVENANCE.md) for exact sources and hashes. The approved
board is used only by the external acceptance test, never by the entry.

Generate fresh screenshots and the official dossier:

```powershell
node tools/capture.mjs "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" preview screenshots
node main.ts --input E:\Codex-Makefun\radar-kit-work\token-radar-01-kit\input\snapshot.json --output out
node E:\Codex-Makefun\radar-handoff\verify-radar.mjs E:\Codex-Radar-Entry E:\Codex-Makefun\radar-kit-work\token-radar-01-kit\input\snapshot.json
```

For this restricted Windows host, captures and browser smoke tests used
`$env:RADAR_LOCAL_BROWSER_TEST='1'`: an ephemeral local-file-only browser profile
without Chromium's nested sandbox. No installed browser setting was changed.
The host sandbox remained in force. `tools/browser-smoke.mjs` exercises the real
browser interface; `tools/verify-build.mjs` compares all nine full-build files.

Bundle the actual native session and run the supplied kit's worktree preflight:

```powershell
node tools/preflight.mjs E:\Codex-Makefun\radar-kit-work\token-radar-01-kit C:\Users\corrz\.codex\sessions\2026\11\17\rollout-2026-11-17T05-10-30-01a1e9a1-4df3-72f3-a7b0-355fdc8279a0.jsonl
```

The preflight uses the official CLI unchanged. A narrowly scoped Windows preload
handles its content-addressed temporary cache's read-only replacement race; it
changes no transcript, scorer rule or repository file. See `review/RESULTS.md`.

The sandbox defaults are `/input/snapshot.json` and `/output`; `MAKEFUN_OUTPUT_DIR`
and `--input`, `--output`, `--screenshots` support local review. A full build
requires three actual PNG captures; `--preview` omits the dossier.

This local workspace is prepared for an independent new public GitHub repository.
Before publishing, run `node tools/prepare-github.mjs <owner> <repo>` to add its
two real rank/reward badges. Set its GitHub About website to the competition page
and topic to `makefun`. No remote repository or submission is claimed here.
See `review/RESULTS.md` for checked outcomes and remaining submission work.
