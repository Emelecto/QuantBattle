# Competition catalog and personal submissions

Scope: `/app/tournaments`, `/app/tournaments/[id]` and `/app/submissions`. These authenticated surfaces inherit the institutional light shell in `DESIGN.md`. The approved structure is a card catalog for choosing a competition and a separate personal history for inspecting submissions.

## Product boundary

The catalog consumes a provider-neutral `Competition` card shape: title, date, description, tags, deadline, status and destination. Future modality adapters can supply that shape without changing the catalog layout. Its only implemented source is independently published daily stock-return rounds; no additional source or competition-creation backend is established.

Current entries are labeled **Predicción diaria**, distinguished by their actual target date, asset count and deadline. Multiple cards represent multiple published rounds; they do not establish additional competition types, a fixed catalog count or a generalized weekly competition backend. Existing weekly routes and their release rules remain separate.

## Catalog and round workspace

- Lead with the task heading, brief context and preparation links. Status filters precede a two-column card grid; the loaded rounds are ordered by target date, newest first. `Cargar más torneos` appends another server page.
- Each card presents its round date, written status, prediction task, asset metadata, absolute Colombia deadline and direct `Ver torneo` action. Open cards also show compact remaining time without seconds. Catalog state counts describe the loaded records and say so when more records are available.
- **Abierto** requires an open round whose deadline is still ahead. **En evaluación** covers closed, unreleased rounds. **Finalizado** requires the server's settled state. Do not infer a result from the passage of time.
- The detail route is a single work surface: round context and deadline, help links, data downloads, then the existing prediction-upload and receipt workflow. The upload availability follows the round state. Returning to the catalog and opening personal history remain direct links.

## Personal history

- Lead with `Mis envíos`, then explicitly labeled **Resumen de esta página** counters for registered, pending and evaluated records. These are page-scoped counts, not lifetime totals; loading and failure show a dash.
- Filters are server-owned: all submissions, selected submissions awaiting evaluation, selected evaluated submissions, and previous attempts. Date choices are all dates or the last 7, 30 or 90 days. Filtering resets pagination; previous/next controls move through pages of 20 records.
- Explain that the latest valid pre-deadline file participates. Each record separates round, submitted time, written status, result and receipt action, and identifies the participating file or a previous attempt. A pending result is written as `Pendiente`, never a numeric zero. Scores appear only when the server releases them for a settled round.
- `Ver detalle` expands one inline receipt at a time. It shows the identifier, wrapping SHA-256 fingerprint, and published MAE when available, with a link back to the round. The explanation limits score comparisons to the same round and distinguishes replaced attempts from the selected file.

## Visual and responsive conventions

Use paper and pale blue around flat white surfaces, navy headings, secondary slate text and blue actions. Preserve the established Manrope heading and DM Sans interface pairing. Cards, summary panels, history container and round workspace have thin dividers and modest corners (12px); card padding is 26px on wide screens and 20px on small screens. Icons sit in restrained pale blue squares.

Written statuses accompany color: green for open, blue for evaluation, slate for finalized, amber for previous attempts. Selected filters use blue fill and `aria-pressed`; unselected filters remain white. Record values use tabular numerals, and identifiers/fingerprints use wrapping monospace text.

The surface caps at 1440px. The catalog becomes one column at 850px. History column headings disappear at 1100px, when records reflow into labeled two-column groups; the round title spans the row. At 580px, summary panels stack, date selection and card actions fill the width, receipt details become one column, and padding tightens. Filters and metadata wrap rather than forcing page-wide horizontal scrolling.

Controls have a minimum height of 44px and a visible blue keyboard outline (3px, 3px offset). Filter and pagination feedback lasts 160ms and is removed for reduced motion. Content panels remain still. Receipt controls expose expanded state and their controlled content; statuses and results remain understandable without color.

## Availability and references

Loading, confirmed empty results, filtered emptiness and failed requests have distinct Spanish messages. Failure offers `Reintentar`; it must not imply that no rounds or submissions exist. Catalog and history refresh from the server without substituting invented activity or counts.

Implementation references: `TournamentCatalog.tsx`, `SubmissionHistory.tsx`, `TournamentDetail.tsx`, `competition-utils.ts` and `competitions.css` under `web/src/components/research`; `web/src/lib/competitionCatalog.ts` and `stockTournaments.ts`; `worker/stock_api.py` for the current data boundary. Rendered desktop/mobile references are in `artifacts/competitions-review/{desktop,mobile}-{tournaments,submissions}.png`.
