---
title: "Hello, world"
description: "A sample post that shows how blog entries are written. It is a draft, so it only appears with hugo server -D."
date: 2026-11-17
category: studio
draft: true
---

Every post is a Markdown file in `content/blog/` with this front matter:

- `title` and `description`: the heading, the list summary and the meta tags.
- `date`: the publication date; the blog index filters by its year.
- `category`: an `id` from `data/en/blog_categories.yaml`. An unknown id fails the build.

Set `draft: true` to keep a post out of production builds, or give it a
future `date` to schedule it for the first build after that day.
