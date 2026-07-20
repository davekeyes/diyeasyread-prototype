# DIY Easy Read — UX prototype

A static recreation of [diyeasyread.com](https://diyeasyread.com) (Home, About, Pricing), rebuilt as a clean local base for prototyping UX improvements. This is not the production site — it's a working copy to iterate on layout, flow, and interaction ideas before they go back into the real product.

Built on the shared Volition design system (`assets/colors_and_type.css`, Outfit type, icon set) so anything prototyped here stays consistent with the rest of Volition's products.

## Structure

- `index.html` — Home
- `about.html` — About, including the Easy Read FAQ
- `pricing.html` — Individual and organisation pricing tiers
- `get-started.html` — Upload/drop-zone landing (Screen 0 of the walkthrough)
- `translating.html` — Translating progress screen (Screen 1)
- `ready.html` — "Your Easy Read is ready" screen (Screen 2)
- `preview.html` — Guest preview of the translated document, full content-block anatomy (Screen 3)
- `dashboard.html` — Authenticated dashboard, translation list (Screen 4)
- `document.html` — Authenticated preview of an open translation, with document menu (Screen 5)
- `assets/site.css` — layout and component styles specific to this prototype
- `assets/colors_and_type.css` — Volition design tokens (source of truth, not redefined here)
- `assets/img/dorothy/` — real sample-document photos and cover portrait for the walkthrough

## Notes

- Illustrations from the live site are represented as placeholder blocks rather than copied in, so this stays a layout/UX base rather than a pixel copy.
- Content (copy, pricing, FAQ) is carried over from the live site as of 2026-07-16 since it's Volition's own product content.
- No backend — "Get started", "Sign up or sign in", and buy/subscribe actions are non-functional placeholders for prototyping flows on top of.
- The upload → translate → ready → preview → dashboard → document walkthrough (`get-started.html` through `document.html`) was rebuilt 2026-07-20 from a high-fidelity Claude design handoff transcribed from `DIY Easy Read.fig`. The 16 content-block photos are mapped in page order from generic sample images rather than caption-verified per photo — swap in exact matches later if needed.
