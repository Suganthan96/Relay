# COSMOQ — Next.js conversion

The scraped Framer site (`../index.html` + `../css` + `../framerusercontent.com`)
converted to a Next.js 15 App Router project by `../tools/framer_to_next.py`.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

## Regenerating

The components are generated, not hand-written. Edit the converter, not the
`.tsx` files, or the next run will overwrite them:

```bash
python ../tools/framer_to_next.py   # rewrites app/page.tsx, components/, styles/framer.css, public/images/
python ../tools/verify.py           # diffs the prerender against the original HTML
```

`verify.py` compares the built `.next/server/app/index.html` against the scraped
page element-for-element. Current result:

```
elements   original=2593  next=2593  MATCH
classes    original=2401  next=2401  MATCH
text       MATCH (8809 vs 8809 chars)
styles     0 unexpected diffs, 38 intentional reveal repairs (of 2593)
attr sets  0/2593 elements differ
assets     72 local refs, 0 missing
```

Before the reveal repairs were added, the rendered footer was a **0-pixel diff**
against the original page.

## Layout

```
app/layout.tsx              <html>/<body>, metadata, stylesheet imports
app/page.tsx                assembles the page; owns the #main / wrapper divs
components/
  Nav.tsx  Footer.tsx  BuyNowBadge.tsx  CookieBanner.tsx  FramerBadge.tsx
  SvgTemplates.tsx          #svg-templates — 16 <svg> defs that 36 <use> refs point at
  sections/                 Hero, HighlightedText, Exceptionalities, Features,
                            Products, Steps, DataAndPrivacy, Testimonial,
                            Pricing, Faq, Decor, Integration
styles/framer.css           the scraped stylesheet, asset URLs rewritten
styles/breakpoints.css      documentation only — see "Responsive" below
types/css.d.ts              widens CSSProperties for custom props + corner-shape
public/images/              72 images, lowercased filenames
```

## What the converter does

Framer differs from a Webflow export in ways that shape the script:

- **Inline styles are the layout.** 2,243 `style` attributes carry position,
  transform, mask and gradient values. They are converted to JSX style objects
  rather than dropped, splitting on top-level `;` so `url(...)` survives.
- **Class names are content hashes** shared with a 300 KB stylesheet, so every
  class is preserved verbatim.
- **Text whitespace is load-bearing** — the footer headline is split into
  per-word spans. Any text node that is not already trimmed is emitted as a JSX
  string expression so JSX cannot strip its spaces.
- **Inline SVG is hoisted** into `#svg-templates` and referenced by
  `<use xlink:href="#…">`; all 36 references resolve.

Attributes removed, all no-ops: `as` (restates the tag it sits on),
`parentsize` / `_constraints` / `rotation` / `shadows` (serialised React props
that leaked into the HTML, e.g. `"[object Object]"`), and `name` on layer
`<div>`s (always duplicates `data-framer-name`; kept on form elements).

## Two repairs, and why

**1. A mangled inline SVG.** One `<img>` in the Products cards had an inline
`data:image/svg+xml,<svg …>` source. The scraper mistook it for a URL and
flattened it into a filename, so it 404'd. The whole SVG survived inside that
string and is decoded back. Path commands are restored as absolute `M`/`L` —
every coordinate lies inside the `0 0 578 462` viewBox, which relative commands
would accumulate straight out of.

**2. 38 scroll-reveals frozen mid-animation.** Framer plays reveals when a
section scrolls into view. The scrape was taken from the top of the page, so
everything above the fold is captured settled (`opacity: 1; transform: none`)
while sections further down are frozen at the reveal's *initial* state. With no
Framer runtime to finish the animation, those render invisible. Affected:

| Section | Elements | Frozen state |
|---|---|---|
| Data & Privacy | 1 | `opacity: 0; translateY(20px)` |
| Pricing | 4 (tab + 3 cards) | `opacity: 0; translateY(20px)` |
| FAQ | 16 (8 rows × 2 nested) | `opacity: 0; translateY(20/30px)` |
| Integration | 7 (6 tiles + gradient) | `opacity: 0; translateY(20/60px)` |
| Footer | 10 (headline words, aurora BG, wordmark) | `opacity: 0/0.001; blur(10px)` |

The detection is deliberately narrow: opacity `0`/`0.001` **plus** a real
translate/scale offset or an entry blur. Four elements that are `opacity: 0`
*without* an offset are left hidden, because they are hidden by design:

- `Logo 1` and `Logo 3` in the logo marquee — a crossfading slot where one of
  three stacked images shows at a time (`Logo 2` is the visible one).
- The inactive `Monthly` label in the Monthly/Yearly pricing toggle.
- A hover-only `|` separator in Features (`transition: opacity 0.2s`).

## Known gaps in the source scrape

These are limits of the scraped input, not of the conversion.

**No interactivity.** `script_main.chs8u5w7.mjs` imports 9 chunks
(`react`, `motion`, `framer`, …); 8 were never downloaded, so Framer's runtime
cannot run. Everything renders in its captured state: the FAQ accordions are
collapsed and do not open, the pricing toggle sits on Monthly, marquees and
carousels are static, and the mobile menu button does nothing. Re-implementing
these in React is straightforward but is new behaviour, not a conversion.

**Desktop breakpoint only.** Framer server-renders all three breakpoint copies
of a component and toggles them with `hidden-<hash>` classes. This scrape was
taken at desktop width, so only the desktop copies exist. The classes are still
in the markup, but the matching CSS rules are **not** applied — of the 15 slots
carrying them, 11 have no surviving child once the rules bite, including the
entire nav and footer (both collapse to 0×0 below 1200px). Below 1200px you get
the desktop markup resized by the 36 responsive rules that *are* in
`framer.css`. For the real tablet/phone design, re-scrape at ~900px and ~390px,
then uncomment the block in `styles/breakpoints.css`.

**4 assets still load from Framer's CDN** — they were not in the scrape:

| Asset | Used for |
|---|---|
| `assets/XyQKBChh8CZBaaXrJoxPbwvI.mp4` | hero dashboard video |
| `images/6mcf62RlDfRfU61Yg5vb2pefpi4.png` | a 256×256 avatar |
| `images/1VtXtUrlVK0Y1WHlW4GIfnhxFho.png` | favicon |
| `assets/LaGEDiVbTeEg75rIXlNKdeL8x4.png` | Open Graph image (metadata only) |

**Fonts load from Framer's CDN.** `framer.css` has 112 `@font-face` rules
pointing at `framerusercontent.com/assets/*.woff2`; no font files were scraped.
Left as-is so the type is metrically identical. To self-host, download those
woff2 files into `public/fonts/` and rewrite the `src:` URLs.

**Framer template chrome is still present** — the "Buy Now" button
(`components/BuyNowBadge.tsx`) and the "Made in Framer" badge
(`components/FramerBadge.tsx`). Both came from the template; delete the two
`<BuyNowBadge />` / `<FramerBadge />` lines in `app/page.tsx` to remove them.

**Star positions are baked in.** The starfield is 300 absolutely positioned
dots with pixel coordinates from the 1440px capture. They do not
reflow, which is what the original does too once rendered.
