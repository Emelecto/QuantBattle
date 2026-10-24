# QuantLab visual system

## Purpose
Help Spanish-speaking researchers understand and complete a prediction tournament. Public pages introduce the research workflow; authenticated screens prioritize the next action, readable records and explicit states. Functionality and scientific accuracy govern visual decisions.

## Identity
- Graphite background `#0b0e12`, panel `#11161c`, raised surface `#181e26`.
- Text `#edf2f7`, secondary text `#aab7c6`, divider `#303a46`.
- Ice-blue action `#b9dcf6`. Green and red denote outcomes or status, not decoration.
- Geist Sans for interface and prose; Geist Mono only for data, hashes, parameters and code.
- Solid surfaces and modest corners. No blanket glass blur, decorative returns chart or floating dashboard panels.

## Public pages
The landing uses a two-line typographic statement, then four stages of the real workflow. Product images are actual captures from the technical account, explicitly labeled with date and synthetic context. They open at full size. Claims link to the public pilot record. No adoption or profitability claims.

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
Visible keyboard focus, named controls, native disclosure semantics and consistent state colors. Content panels do not move on hover. Product content has no entrance animation; landing motion is brief and respects reduced motion. Loading, errors and empty states must remain distinguishable.

## References and verification
Linear informed product-in-context demonstrations; Vercel informed technical hierarchy. Neither branding nor source code was copied. Screenshots and verification reports belong in `artifacts/visual-redesign`.

The design skill's motion quota is subordinate to the user's functionality-first brief: do not add eight decorative animations to satisfy a counter. The four numbered stages represent a real ordered procedure, not ornamental labels. Public image assets must never contain session tokens, credentials or private account identifiers.
