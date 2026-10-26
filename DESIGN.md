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

## Interaction and motion
Visible keyboard focus, named controls, native disclosure semantics and consistent state colors. Content panels do not move on hover; interactive links and controls use brief feedback. The preview's result chart animates once when opened, using the recorded per-era values. Landing and dashboard motion respects reduced motion. Loading, errors and empty states must remain distinguishable; a failed round lookup must never be presented as an empty schedule.

## References and verification
The approved mockups are `artifacts/landing-mockups/06-institucional-v2.html` and `artifacts/dashboard-mockups/01-dashboard-light.html`. Screenshots and verification reports belong in `artifacts/visual-redesign`.

The design skill's motion quota is subordinate to the user's functionality-first brief: do not add eight decorative animations to satisfy a counter. The four numbered stages represent a real ordered procedure, not ornamental labels. Public image assets must never contain session tokens, credentials or private account identifiers.
