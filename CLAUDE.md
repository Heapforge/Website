# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
hugo server          # dev server on http://localhost:1313, live reload
hugo --gc --minify   # production build into public/
```

Requires **extended** Hugo, v0.165.0 or newer (this repo uses the modern flat
`layouts/` convention — `home.html`, `section.html`, `page.html`, `_partials/` —
not the legacy `layouts/_default/` + `partials/` layout). There is no test
suite, linter, or package manager: Hugo is the only build tool, and the CSS/JS
pipelines run inside templates via Hugo Pipes and its bundled esbuild.

Deployment is Cloudflare Workers static assets (`wrangler.jsonc`): `public/` is
served directly, no Worker code. `hugo --gc --minify` is the build command and
must run before `wrangler deploy`. `public/` and `resources/_gen/` are
gitignored — never commit build output or hand-edit files there.

## Architecture

**The site is data-driven, not content-driven.** The home page has almost no
Markdown; `home.html` stacks section partials from `layouts/_partials/sections/`
(hero → focus → projects → services → clients → open-source →
contact), each rendered from `data/*.yaml` or site params:

- `data/focus_areas.yaml` (`id`, `name`, `summary`, `icon`) feeds
  `sections/focus.html`. Its `id`s are what `categories` in the project files
  reference; `icon` names a brand icon (see Iconography below).
- `data/projects.yaml` feeds the scroll-snap carousel in `sections/projects.html`
  (`name`, `description`, `summary`, `categories`, optional `url` and
  `screenshot`). An entry without `url` is unreleased: instead of a screenshot
  it gets a generated "coming soon" card from `_partials/forge-card.html`.
- `data/client_work.yaml` has the same shape and feeds `sections/clients.html`.
- `data/services.yaml` (`offerings`: `name`, `icon`, `summary`) feeds
  `sections/services.html` and `llms.txt`.
- `data/team.yaml` has no home-page section; it feeds the JSON-LD founders
  and the Team list in `llms.txt`.
- `sections/contact.html` is the closing call to action, built from
  `params.contact.email` and `params.locations`.
- Screenshots are paths under `assets/`,
  so `resources.Get` can process them (`_partials/screenshot.html`) and emit
  real width/height attributes.
- `layouts/section.html` lists a section's own pages as a document list
  (`.Title` / `.Description` / `.RelPermalink`, by `weight`), so adding a legal
  document needs only a Markdown file with front matter and a `weight`.

Because of this, the YAML files are the single source of truth: `home.html`,
`home.llms.txt`, and `head/schema.html` (JSON-LD founders) all read the same
data. Adding a project or team member updates the page, `llms.txt`, and the
structured data together — do not duplicate the information anywhere else.

**Generated crawler/AI files.** `robots.txt`, `sitemap.xml`, and `llms.txt` are
build outputs. `llms.txt` is a custom Hugo output format declared in
`hugo.toml` (`[outputFormats.llms]`, enabled via `[outputs] home`) and rendered
by `layouts/home.llms.txt`. Edit those templates or `hugo.toml`, never
`public/`. `head/meta.html` deliberately excludes the `robots` output format
from its `rel="alternate"` links.

**Site metadata lives in `hugo.toml` `[params]`**, including
`params.organization` (legal name, `sameAs`, founding locations),
`params.openSource`, `params.contact.email` and `params.social` (LinkedIn,
GitHub: footer icon links, appended to the JSON-LD `sameAs`, listed in
`llms.txt`). `head/meta.html` and `head/schema.html` compose all SEO,
Open Graph, and schema.org output from those params plus per-page
`title`/`description` front matter — page titles go through
`_partials/func/title.html`. Copy that names the company, its locations, or its
links should read from params rather than being hard-coded in a template.

**Asset pipelines.**

- CSS: `_partials/head/css.html` holds an explicit ordered `$sheets` slice
  (tokens → reset → layout → typography → components) concatenated into one
  fingerprinted bundle. A new stylesheet in `assets/css/components/` is invisible
  until listed there, and a missing file fails the build via `errorf`.
- JS: `_partials/scripts.html` runs `js.Build` on `assets/js/main.js` (target
  es2018). New behaviour goes in a module under `assets/js/modules/` and is
  imported from `main.js`.
- Minify + fingerprint (with SRI) only happen under `hugo.IsProduction`.

**Brand.** The design follows the Heapforge brand guidelines (2026): Forge
Navy `#1E293B`, Ember Orange `#D9532F`, Paper `#F3F0E8`, White. Ember is for
emphasis, never paragraphs.

- Logo: `_partials/logo.html` inlines the official artwork from
  `assets/images/brand/logo-{horizontal,stacked,symbol,wordmark}.svg`
  (`wordmark` is the type cut from the horizontal lockup, same paths). Its paths carry
  `logo__ink` / `logo__flame` classes coloured by `--logo-ink` / `--logo-flame`,
  which is how dark mode shows the sanctioned white-on-dark variant. Never
  redraw, recolour, rearrange or rebuild it in type. Brand minimum widths:
  horizontal 240px, stacked 160px, symbol 40px. The header pairs the
  symbol with the wordmark at the same height (top and bottom aligned), both with `mix-blend-mode: var(--logo-blend)` so the
  hero shader shows through; below the mobile-menu breakpoint (78rem, set in
  both `header.css` and `js/modules/header.js`) it shows the
  symbol only, at 40px. In the header and footer the symbol's flame is live:
  `logo.html` with `heat` publishes the flame paths alone as
  `images/brand/logo-symbol-flame.svg`, which masks a canvas drawn by the
  flame shader in `heat-field.js` (`[data-heat-logo]`); the ink stays solid and
  the SVG flame is the no-WebGL fallback. `assets/favicon.svg` is the symbol
  with its own light/dark colours.
- Iconography: `_partials/icons/icon.html` (`name`, `size`) inlines
  `assets/icons/<name>.svg` when it exists. These 48 icons were extracted from
  the vector icon page of the brand guidelines: 24px grid, navy line =
  `currentColor`, Ember accent = `.icon__accent` (`--icon-accent`). Glyphs the
  brand set lacks (arrows, sun/moon, pin) fall back to stroke paths in
  the partial, drawn at the same 1.5px line. An unknown name fails the build.
- Type: the brand pairs Nebulas (headings) with Geist (body). Nebulas is not
  licensed for web use yet, so `--font-display` is Geist too. `tokens.css`
  explains the one-line switch. `--font-label` is the small uppercase label
  style; `--font-code` is only for code in prose.

**Styling conventions.** `assets/css/base/tokens.css` defines every colour,
radius, spacing, and font value; no other stylesheet should hard-code a hex
value. Both themes are defined there (`:root[data-theme="light"|"dark"]`). An
inline script in `head/head.html` sets `data-theme` before first paint from
the stored toggle choice or `prefers-color-scheme`. `js/modules/theme.js` runs
the toggle, and the hero shader (`js/modules/heat-field.js`) re-reads its
`--heat-*` colours on theme change. `--accent` is decorative only (borders,
markers, icon accents) — use `--accent-text` for any accent-coloured text,
since it is the WCAG AA-compliant sibling. Class names are BEM-ish
(`focus__name`, `slide__media`, `site-footer__nav`).

Taxonomies and RSS are disabled in `hugo.toml` (`disableKinds`); the site is
single-language `en-GB` with `unsafe` Goldmark HTML enabled so policy Markdown
can contain raw HTML.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
