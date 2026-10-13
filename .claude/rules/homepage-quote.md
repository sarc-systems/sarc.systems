---
paths:
  - "data/homepage_quotes.yaml"
  - "layouts/partials/homepage-quote*"
  - "assets/js/homepage-quote.js"
---

<!-- Moved verbatim from the root CLAUDE.md; loads only when working on homepage-quote files. -->

## Homepage quote

Beneath the mark and institutional name sits one editorial quotation —
replacing what used to be a static discipline line
("computation · nonlinear dynamics · feedback · synthesis"). This is homepage
editorial content, **not part of the Library**: quotes are never stored in a
Library entry's front matter, never become Library entries themselves, and
never appear in `index.json`, the Library filters/counts, or the Library
random-selection system. An optional `library_ref` may point *into* the
Library (a one-way pointer, validated to resolve — see below), but that's the
only relationship between the two systems.

**Data.** `data/homepage_quotes.yaml` — a flat list. Each quote: `id`
(required, unique, stable kebab-case — session storage and the client script
key on this, never on array position or on `text`), `text` (required),
`author` (required), `work` (optional), `year` (optional), `citation`
(required — an editorial verification note for maintainers; not shown on the
page), `source_url` (optional, the exact source page, never a bare homepage
or search result), `library_ref` (optional, another entry's `library.id`),
`enabled` (optional, default true). Quotes must be manually selected and
verified — one sentence or a distinctive fragment, roughly 5–25 words,
language relevant to SARC's intellectual position; no generic inspirational
language, slogans, lyrics, or paraphrases presented as direct quotations.
Leave a quote `enabled: false` rather than guess at uncertain wording; leave
`citation` honestly hedged (e.g. "exact page not yet pinned down") rather than
inventing a page number or edition. Quality over quantity — a handful of
carefully verified quotes beats a large uncertain set.

**Rendering.** `layouts/partials/homepage-quotes-resolve.html` resolves the
enabled quotes once, computing `library_url`/`link_target` per quote so
neither the server render nor the client script needs its own Library lookup:
`link_target` is `"work"` when the quote names a `work` (assumed to be the
referenced entry), `"author"` when the resolved entry is a `person` and no
`work` is given, `"full"` when `library_ref` resolves but neither applies, or
empty when there's no `library_ref` at all. `homepage-quote-attribution.html`
renders the footer for one resolved quote from that rule — author linked,
work linked (in `<cite>`), the whole attribution linked, or nothing linked;
an external `source_url` is always a separate, distinctly-labelled `Source ↗`
link, never conflated with a Library link. `homepage-quote.html` renders the
**first enabled quote** (deterministic; `Math.random()` in a Hugo template
would only randomize once per build, not per session, so the SSR version is
never random) as the no-JS fallback, embeds all enabled quotes as inline JSON
(`#homepage-quotes-data`, no separate fetch), and inlines
`assets/js/homepage-quote.js`'s content directly as a **non-deferred**
`<script>` — deliberately not the usual `<script src defer>` pattern used
elsewhere, so it runs synchronously as the parser reaches it, right after the
fallback markup, avoiding a visible flash from the fallback quote to the
session pick. The client script mirrors the attribution-link rule by hand,
an accepted duplication since it can't call a Hugo partial at runtime.

**Selection.** One quote, stable for the browser session (`sessionStorage`,
revalidated against the current enabled set on every read — a stored id
that's no longer enabled/present is discarded and redrawn), refreshing keeps
it, a new session may get another. A light `localStorage` memory of the last
session's pick avoids immediate repetition across sessions when there's more
than one enabled quote; this is a convenience, not a real history. No
"select again" control, no timer/rotation, no visible counter — a rotating
institutional epigraph, not a quote-of-the-day widget.

**Validation** (`homepage-quotes-validate.html`, via `partialCached` from
`head.html`, alongside but independent of the Library's own validator). Fails
the build on: a missing/duplicate `id`; missing `text`/`author`/`citation`; a
non-boolean `enabled`; a malformed, Google, or bare-homepage `source_url`; a
`library_ref` that doesn't resolve to exactly one published Library entry;
duplicate quote text (normalized whitespace/case). Warns (doesn't fail) on a
quote well past the ~5–25-word guideline.
