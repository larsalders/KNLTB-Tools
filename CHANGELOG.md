# Changelog

## [2.4.0] — 2026-08-02

### Performance

**"Show Matches" fetches group pages concurrently** (draw simulator)
The group pages behind "Show Matches" were fetched strictly one at a time — eight poule groups meant eight sequential round trips. They now run up to five at a time. The results are collected by index rather than in completion order, so the imported match list is identical to before; only the waiting overlaps.

**"Refresh ratings" fetches profiles concurrently** (draw simulator)
Same change for the per-player profile fetches. Each player writes only their own rating, so the outcome is unchanged.

**Player profile ratings are cached per session**
A profile page is fetched once and reused — for a player reached under two name spellings, or for a second import in the same session. Failed fetches are evicted so they stay retryable.

**"Find all" overlaps its baseline and profile phases**
The current event's group pages and the player profile pages are independent, so they are now fetched at the same time instead of back to back.

### Diagnostics

**Import timing report**
"Show Matches" and "Find all" each print a phase-by-phase timing table to the browser console, with per-call tallies for fetches and iframe fallbacks. This is what identified where the time actually goes.

### Notes on what did *not* change

"Find all" is bounded by the browser's ~6 connections per host, not by how the work is scheduled. Measurements showed raising concurrency past 6 makes it slower, not faster, and that the iframe fallbacks it depends on are all genuinely necessary — those category pages render their matches client-side. The concurrency limits in `draw-state.js` are set to the measured ceiling; raising them is counterproductive.

---

## [2.3.1] — 2026-08-02

### Bug fixes

**"Go to overview" in the upcoming-match banner led to the wrong event**
The button in the blue "Volgende wedstrijd" header on the home page resolved its target differently from the per-category buttons: it searched the *current page* for an "Onderdelen" link, which on the home page belongs to whichever tournament happens to be listed first rather than the one in the banner. It then picked the best-matching category from that unrelated tournament's page.

The banner button now finds the "mijn toernooien" draw link for its own tournament and category and resolves the overview through exactly the same code path as the per-category buttons, so both land on the same page. When a tournament has sibling categories the banner text cannot tell apart, it falls back to the Onderdelen path instead of guessing a sibling. That fallback no longer scans the current page for unrelated tournaments either — it fails visibly rather than redirecting somewhere wrong.

---

## [2.3.0] — 2026-07-26

### New features

**Player / team filter** (draw simulator)
A new **Filter** dropdown above the match table lists every player and every team/pair in the loaded matches. Selecting one shows only the matches that player or pair appears in, and narrows the player rating summary to match. The filter is display-only: ratings are still simulated over the full match queue in chronological order, so the numbers stay correct regardless of the filter.

**Copy / Share to WhatsApp** (draw simulator)
Two new buttons turn the current (filtered) results into WhatsApp-friendly text: **Copy** puts it on the clipboard, and **Share to WhatsApp** opens WhatsApp with it prefilled. The text leads with per-match rating changes (each player's start → new rating with a triangle — ▲ for a rating drop / win, ▼ for a rating rise / loss, matching the in-app convention), followed by win %, result, and a cumulative per-player total. Winning team names are shown in bold. The filter and both buttons stay hidden until matches are loaded via **Show Matches** or **Find all**.

---

## [2.2.0] — 2026-06-14

### New features

**Season range slider** (player profile)
Clicking "Import All" now opens an inline dual-handle slider showing all available seasons from oldest (left) to newest (right), with a dot per season and short year labels. Drag the handles to select a range, then tap "Import" to start. Tapping "Import All" again dismisses the slider.

**Last 3 seasons button** (player profile)
A dedicated "Last 3" button imports the three most recent seasons in one tap — no slider interaction needed.

**Match-by-match import ticker** (player profile)
Match parsing is now asynchronous (one match per event loop tick) so the browser repaints between each match. The progress label shows the current match number, date, category, and win/loss icon as they flash by, giving live visual feedback during import.

**Import progress bar** (player profile)
A thin progress bar with a sub-label appears below the status line during any import and automatically hides when the import completes.

**Touch-friendly date filter slider** (player profile)
The date range slider now supports touch events (`touchstart`/`touchmove`/`touchend`) with `touch-action:none` to prevent scroll conflicts. Thumbs are enlarged to 26 px for easier tapping on mobile.

**Panel auto-resize after import** (player profile)
`fitPanelToContent` is called after every import finishes so the panel expands to fit newly visible content without needing a manual resize.

### UX changes

Import buttons are now split into two rows for better readability and touch ergonomics: **[Current | Last 3 | All]** on the top row and **[Chart | Matches | Stats]** on the bottom row.

---

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
