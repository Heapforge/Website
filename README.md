# Website

The Heapforge website, built with [Hugo](https://gohugo.io) (extended).

## Develop

```sh
hugo server          # http://localhost:1313, live reload
hugo --gc --minify   # production build into public/
```

Requires the **extended** Hugo build (v0.165.0 or newer).

## Layout

```
hugo.toml                  Site config: metadata, SEO defaults, output formats
content/_index.md          Home page "About" copy
data/projects.yaml         Own products
data/client_work.yaml      Client projects (same shape as projects.yaml)
data/team.yaml             Team members
assets/css/base/           Tokens, reset, page shell, typography
assets/css/components/     Reusable component styles (BEM-ish class names)
assets/js/main.js          Entry point; bundled from assets/js/modules/ by esbuild
layouts/baseof.html        Page shell every template extends
layouts/home.html          Home page sections
layouts/page.html          Generic content page
layouts/_partials/         head/, sections/, icons/, func/
```

## Adding things

- **A project, client or team member** — add an entry to the matching file in
  `data/`. Both the page and `llms.txt` pick it up.
- **A page** — add `content/<name>.md`. It gets the shared head, header, footer,
  stylesheet and scripts automatically via `layouts/page.html`.
- **A stylesheet** — drop it in `assets/css/components/` and list it in
  `layouts/_partials/head/css.html`; the bundle order is explicit there.
- **A script** — add a module under `assets/js/modules/` and import it from
  `assets/js/main.js`.

`robots.txt`, `sitemap.xml` and `llms.txt` are all generated at build time —
edit their templates (`layouts/home.robots.txt`, `layouts/home.llms.txt`) or
`hugo.toml`, not files in `public/`.
