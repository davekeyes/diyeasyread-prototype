# Known issues / deferred work

Running list of things we've flagged but intentionally punted on while working through the walkthrough page by page. Check items off as they're addressed.

## Layout

- [ ] **Responsive/mobile view is bad** across the walkthrough (`get-started.html` at minimum, likely the rest of the flow too). Deferred until the desktop flow is fully sorted.

## Behavior

- [ ] **`get-started.html` dropzone**: clicking anywhere on the "Drop a file here" panel currently moves straight to `translating.html`. Real behavior should be triggered by an actual drag-and-drop file drop, or a click that opens a file picker and only advances once a file is selected — deferred per Dave, 2026-07-20.
- [ ] **`translating.html` "Ready" banner destination**: per the Figma design (node 428:6661), once the simulated translation completes, a fixed "Your Easy Read preview is ready!" banner appears and its "View preview" button links straight to `preview.html`, bypassing `ready.html` entirely. That may mean `ready.html` (the separate confirmation page, built earlier in this flow) is no longer part of the real intended path — needs Dave's confirmation on whether to keep `ready.html` reachable some other way or fold/remove it.
- [ ] **`translating.html` "Ready" banner arrival trigger**: currently a 14s timer (plus click-anywhere-to-reveal early). Dave is considering dropping the timer-based arrival entirely — revisit once decided.

## Fidelity gaps to double-check

- [ ] `translating.html`'s intro-page definition callout ("Preview means it will be read-only…") uses the real 💡 emoji character per its Figma node (428:6661), but `preview.html`/`document.html`'s definition callouts (built earlier from the unverified `.dc.html` handoff) use an SVG lightbulb icon instead. Worth checking preview.html's callouts against Figma directly rather than assuming the SVG version is correct.
- [ ] `translating.html`'s "Learn what you can do with DIY Easy Read" row (page 1) is simplified — Figma layers a background rectangle + small muted logomark badge + the person illustration; only the person illustration was used here.

## Assets

- [ ] `assets/diyer_footer_logo.svg` — a subtle sand-tinted decorative mark, looks built for the footer band, which currently has no logo. Not wired in anywhere yet.
- [ ] `assets/intro1.png`–`intro4.png`, `assets/intro_doc_ready.png` — unclear purpose. Don't match any placeholder described in the original design handoff. Left unreferenced.
- [ ] The 16 content-block photos in `preview.html`/`document.html` (`assets/img/dorothy/`) are mapped to their placeholders in page order (Slot-1 → p2-r1, etc.), not verified caption-by-caption against the actual photo content. May need swapping for closer matches.

## Notes

- Live Vercel URL isn't fetchable via the connected MCP account (different Vercel team scope) — check the Vercel dashboard directly if needed.
