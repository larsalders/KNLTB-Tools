# Changelog

## [2.1.0] — 2026-06-11

### New features

**Import All Seasons** (player profile)
A single button that loops through every season tab — tennis and padel in parallel — expands all accordions, parses every match, and deduplicates the result. Seasons before 2021/22 are skipped because they use a different rating format. Accordions that report zero matches are skipped to avoid unnecessary requests.

**Date range filter slider** (player profile)
A dual-handle slider for filtering the chart and match table by date. The handles snap to actual match dates. Dots on the slider track are coloured by win/loss result; hovering or dragging a dot shows a tooltip with the match details — category, result, tournament, teams, rating, and rating impact.

**Filter state persistence** (player profile)
The active tab in the match table and stats panel is now preserved when filter settings change, so you no longer lose your place when adjusting the date range.

**In-place chart refresh** (player profile)
Applying a filter now updates the chart data in-place without triggering an animation or disrupting the layout in maximised mode.

### Bug fixes

**Go to overview — multi-draw tournaments** (draw page / home page)
The *Go to overview* button was missing for tournaments where individual draws are listed under `h5` headers rather than `h4`. Fixed the selector so the button appears in those cases. The banner button on the home page was also affected: it now matches by tournament ID (covering `/sport/draw.aspx?id=…` URLs) and resolves to the correct specific event page rather than a sibling category.

---

## [2.0.0] — 2026-05-18

Initial public release.
