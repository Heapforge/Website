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
Markdown; its sections are rendered from `data/*.yaml` by generic partials:

- `data/projects.yaml` and `data/client_work.yaml` share one shape
  (`name`, `description`, `summary`, optional `url`) and are both rendered by
  `layouts/_partials/sections/entry-list.html`. An entry without `url` renders
  as plain `<strong>` instead of a link — that is how unreleased work is listed.
- `data/team.yaml` feeds `sections/team.html`; its `image` values are paths
  under `assets/`, so `resources.Get` can process them and emit real
  width/height attributes.
- `layouts/section.html` synthesises the same entry-list shape from a section's
  own pages (`.Title` / `.Description` / `.RelPermalink`), so adding a legal
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
`params.organization` (legal name, `sameAs`, founding locations) and
`params.openSource`. `head/meta.html` and `head/schema.html` compose all SEO,
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

**Styling conventions.** `assets/css/base/tokens.css` defines every colour,
radius, spacing, and font value; no other stylesheet should hard-code a hex
value. `--accent` is decorative only (borders, markers) — use `--accent-text`
for any accent-coloured text, since it is the WCAG AA-compliant sibling. Class
names are BEM-ish (`entry-list__title`, `card__avatar`, `site-footer__nav`).

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
