# Project Lessons - Tempomeme Quest

## What Worked Well

- Confirm the real runtime entry before editing. In this project, `public/` + `server.mjs` was the active site, not `Tempo_pump/`.
- Build end-to-end, not only UI. The final result included page design, form validation, backend API, and local submission storage.
- Keep branding consistent everywhere. Logo was applied in-page and as favicon, and text/content stayed aligned with the same campaign goal.
- Iterate quickly on visual feedback. Typography was tuned in small rounds until it matched your preference.
- Keep existing repo changes safe. Unrelated local content (like `Tempo_pump/`) was not force-added or reverted.
- Verify with real checks. We tested home page, static asset loading, API submission, and cleaned test data afterward.

## Friction We Should Avoid Next Time

- Mixed language UI caused rework. We should lock language direction early (all English or all Chinese) before polishing copy.
- Oversized default typography led to repeated adjustment rounds. Start from a compact type scale for campaign pages.
- Existing remote confusion can happen. Creating a new repo worked, but we should decide early whether to replace `origin` or use a second remote.

## Default Workflow For Future Projects

1. Detect the actual running app entry and tech stack first.
2. Align fixed requirements early: language, brand naming, target style density, and data flow.
3. Implement the full loop in one pass: frontend + backend + validation + persistence.
4. Run a verification checklist before handoff:
   - site loads (`/`)
   - assets load (logo/favicon)
   - core API works
   - no accidental test data left behind
5. If GitHub publishing is requested:
   - commit only relevant files
   - create target repo
   - push and confirm URL + visibility + branch

## Teaming Preferences Learned From This Project

- You prefer direct execution over long proposals.
- You like iterative polish (especially typography and copy) with quick turnaround.
- You value practical delivery: "works locally, can be deployed, can be pushed to GitHub."

## Commitment For Next Projects

- I will default to compact typography unless you ask for larger display style.
- I will keep all user-facing copy in one language from the start.
- I will include deployment-ready checks by default, not just visual completion.
- I will proactively keep a short running checklist and follow it through to completion.
