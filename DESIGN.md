# QuantLab visual system

## Purpose
Help Spanish-speaking researchers understand and complete a prediction tournament. Public pages introduce the research workflow; authenticated screens prioritize the next action, readable records and explicit states. Functionality and scientific accuracy govern visual decisions.

## Identity
- Page background `#f5f8fb`, white panels, pale blue navigation surface `#edf3f8`.
- Navy text `#172840`, secondary text `#52677d`, divider `#dce6ef`.
- Blue action `#245ce5`; restrained green, amber and red for real states.
- Manrope for prominent headings, DM Sans for interface and prose; mono only for data, hashes, parameters and code.
- Solid surfaces, thin dividers and modest corners. The landing and dashboard share a consistent light identity.

## Public pages
The landing uses a two-line typographic statement, an interactive four-step preview populated with recorded synthetic pilot values, then four stages of the real workflow. The preview lets visitors inspect the dataset, model, validated submission and published result without sending real data. The stage visuals are light schematics of the product workflow, not screenshots or claims of live user activity. Claims link to the public pilot record. No adoption or profitability claims.

## Product pages
- `.ql-page` defines the research page width and responsive padding.
- Headings have fixed interface sizes. Global heading defaults live in the base CSS layer so utility classes retain authority.
- Inputs are at least 44px tall, with 16px text in shared forms. Labels remain visible.
- Tables and record lists can use separators. Dense evidence details remain collapsible.
- The home history starts with three entries; expansion, pagination and full-page JSON export are preserved.
- Deadlines show an absolute Colombia date and a compact remaining-time label, without a seconds counter.
- Navigation places tournaments, datasets and learning before secondary strategies and marketplace.
- Empty rankings take only the space they require.

## Components

### Weekly tournament patterns
These patterns extend the existing institutional light shell. The weekly page orders the calendar, selected round's dataset, private submission and receipt, then evaluation method and the week-wide release notice.

- **Calendar:** four labeled round controls form one row on wide screens and a two-by-two grid at 850px and below. Compact spacing at 580px keeps all four choices visible near the start of the mobile page. The selected round has a blue border and pale blue fill; `aria-pressed` and written status communicate selection and availability without relying on color.
- **Forms:** persistent labels accompany white fields with fine borders and modest corners (7px). Model name and seed share a row on wide screens and stack at 580px. The mobile submit action fills the available width and wraps its label. CSV review, server registration, success and failure retain separate written feedback; validation does not imply a published score.
- **Private receipts:** a divider introduces the selected valid submission, with received time, row count and written state in a wrapping definition list. File and dataset hashes use small wrapping monospace text; previous attempts sit in a native disclosure. A retained result is explicitly labeled rather than represented by a zero or an empty metric.
- **Result tables:** captions, muted column headings, thin row separators and tabular numerals support comparison. Tables retain a readable minimum width (610px) inside horizontal overflow containers. Per-round scores and price evidence sit in native disclosures; empty results remain concise prose.
- **Surfaces and feedback:** white round workspaces use fine borders and modest corners (14px); the release notice uses a pale blue inset surface. These panels stay flat. Round controls use brief background and border feedback (160ms), removed for reduced motion. Keyboard focus uses a visible blue outline (3px with 3px offset).
- **Icons:** back, forward and download affordances reuse the shared SVG icon component beside written labels; decorative icons are hidden from assistive technology.

## Interaction and motion
Visible keyboard focus, named controls, native disclosure semantics and consistent state colors. Content panels do not move on hover; interactive links and controls use brief feedback. The preview's result chart animates once when opened, using the recorded per-era values. Landing and dashboard motion respects reduced motion. Loading, errors and empty states must remain distinguishable; a failed round lookup must never be presented as an empty schedule.

## References and verification
The approved mockups are `artifacts/landing-mockups/06-institucional-v2.html` and `artifacts/dashboard-mockups/01-dashboard-light.html`. Screenshots and verification reports belong in `artifacts/visual-redesign`.

The design skill's motion quota is subordinate to the user's functionality-first brief: do not add eight decorative animations to satisfy a counter. The four numbered stages represent a real ordered procedure, not ornamental labels. Public image assets must never contain session tokens, credentials or private account identifiers.
