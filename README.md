# DIY Easy Read — UX prototype

A static recreation of [diyeasyread.com](https://diyeasyread.com) (Home, About, Pricing), rebuilt as a clean local base for prototyping UX improvements. This is not the production site — it's a working copy to iterate on layout, flow, and interaction ideas before they go back into the real product.

Built on the shared Volition design system (`assets/colors_and_type.css`, Outfit type, icon set) so anything prototyped here stays consistent with the rest of Volition's products.

## Structure

- `index.html` — Home
- `about.html` — About, including the Easy Read FAQ
- `pricing.html` — Individual and organisation pricing tiers
- `assets/site.css` — layout and component styles specific to this prototype
- `assets/colors_and_type.css` — Volition design tokens (source of truth, not redefined here)

## Notes

- Illustrations from the live site are represented as placeholder blocks rather than copied in, so this stays a layout/UX base rather than a pixel copy.
- Content (copy, pricing, FAQ) is carried over from the live site as of 2026-07-16 since it's Volition's own product content.
- No backend — "Get started", "Sign up or sign in", and buy/subscribe actions are non-functional placeholders for prototyping flows on top of.
