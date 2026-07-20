# Known issues / deferred work

Running list of things we've flagged but intentionally punted on while working through the walkthrough page by page. Check items off as they're addressed.

## Layout

- [ ] **Responsive/mobile view is bad** across the walkthrough (`get-started.html` at minimum, likely the rest of the flow too). Deferred until the desktop flow is fully sorted.

## Assets

- [ ] `assets/diyer_footer_logo.svg` — a subtle sand-tinted decorative mark, looks built for the footer band, which currently has no logo. Not wired in anywhere yet.
- [ ] `assets/intro1.png`–`intro4.png`, `assets/intro_doc_ready.png` — unclear purpose. Don't match any placeholder described in the original design handoff. Left unreferenced.
- [ ] The 16 content-block photos in `preview.html`/`document.html` (`assets/img/dorothy/`) are mapped to their placeholders in page order (Slot-1 → p2-r1, etc.), not verified caption-by-caption against the actual photo content. May need swapping for closer matches.

## Notes

- Live Vercel URL isn't fetchable via the connected MCP account (different Vercel team scope) — check the Vercel dashboard directly if needed.
