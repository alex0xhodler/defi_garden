# 028 build notes
- Restyle only (per human choice): token-page template now links /style.css and uses the app's --color-*/--neuro-* tokens; content unchanged.
- Tokens-only scoped CSS: neuro surface card, press physics + focus ring on CTA/chips, reduced-motion honored. Zero hardcoded hex (grep-verified, new assertion added).
- CTA class renamed .cta -> .tp-cta (avoid colliding with any app .cta); tests key off href/content, not class, so unaffected. 27 assertions pass.
- Visual correctness (light/dark) needs a browser eyeball on the pulled page — not verifiable in this no-browser env; structural/token correctness is.
