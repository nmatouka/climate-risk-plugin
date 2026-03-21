# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Drought and air quality risk metrics (pending Cal-Adapt API availability)
- Water scarcity/supply risk indicators
- Landslide risk integration with USGS data
- Additional state coverage beyond California
- Property comparison feature
- Export risk reports as PDF
- Firefox browser support

---

## [1.5.0] - 2026-03-20

### Added
- **Wildfire Probability** — Mid-century (2050s decade) wildfire occurrence probability from Cal-Adapt / UC Merced (`fireprob_10y_HadGEM2-ES_rcp85_bau`), classified Minimal → Severe
- **Projected Flood (FC-FIRM)** — FEMA Future Conditions flood hazard extracted from the same NFHL API response via `ZONE_SUBTY` field; no additional network request
- **Current vs. Projected layout** — Risk cards grouped into "Current Conditions" (wildfire FHSZ + flood NFHL) and "Mid-Century Projections" (6 projected indicators) sections, each with an aggregate risk level badge
- **Now → 2050 headline summary** — Top-of-results row showing aggregate current level, aggregate projected level, and a directional trend indicator (↑ higher / ↓ lower risk)
- **Dual-layer CAL FIRE query** — Wildfire risk now queries both SRA (layer 0) and LRA (layer 1) in parallel and takes the highest result, closing a gap where local-responsibility-area properties returned no data

### Fixed
- **Extreme Heat Days** — Replaced estimation formula with actual Cal-Adapt daily data query (`imperial=True`, no `freq`/`stat` params); counts days > 95°F directly and divides by unique years in the index; threshold updated from 100°F to 95°F
- **Extreme Precipitation** — Corrected unit conversion from kg/m²/s to annual inches (`× 86400 × 365 / 25.4`); recalibrated thresholds to match validated ClimateShed methodology

### Changed
- **Flood data source** — Replaced ~13MB local GeoJSON (hosted on GitHub Pages) with live FEMA NFHL REST API (Layer 28); single point query returns both current zone and FC-FIRM future conditions
- Removed `nmatouka.github.io` host permission; added `hazards.fema.gov` host permission in its place
- FC-FIRM "Not mapped" cards now display an explanatory detail string so users understand the absence of data reflects incomplete coverage, not absence of risk

### Technical
- `dataFetcher.js` v3.0 — `fetchFloodRisks()` returns `{current, projected}`; `fetchWildfireProjection()` new; `fetchExtremeHeatDays()` rewired to daily Cal-Adapt endpoint
- `sidepanel.js` — `aggregateLevel()` replaces `calculateOverallRisk()`; `renderSummaryRow()`, `renderSectionHeader()`, `renderRiskCards()` new layout functions
- `sidepanel.html` — new IDs: `risk-summary-row`, `current-section-header`, `current-risk-container`, `projected-section-header`, `projected-risk-container`

---

## [1.4.0] - 2025-02-20

### Added
- **Multi-site support** — Expanded from Zillow-only to 6 supported real estate websites: Zillow, Realtor.com, Redfin, Trulia, Compass, and Homes.com
- **Extension icon badge** — A dot (●) appears on the toolbar icon whenever you're viewing a supported property page, providing a visual cue to open the side panel
- **First-install notification** — Prompts new users to pin the extension to the Chrome toolbar so the badge is always visible

### Fixed
- Trulia `/home/` URL format now correctly recognized as a property page (e.g. `trulia.com/home/address-id`)
- Compass `_pid` and other `_XXXid` URL suffixes now correctly recognized (generalized from `_lid` pattern)

### Technical
- `SITES` table architecture in `sidepanel.js` for per-site URL detection and address parsing
- Shared `parseSlug()` backward-parser handles hyphen-slug formats across all supported sites
- `isPropertyUrl()` in `background.js` updated to match all 6 sites
- `background.js` now uses `chrome.notifications.create()` for first-install pin prompt

---

## [1.3.0] - 2025-01

### Changed
- **Architecture refactor** — Removed all content scripts; climate risk data now displays in a Chrome Side Panel that does not modify real estate websites
- **Address extraction** — Property addresses are now read from the browser URL bar instead of scraping page content (JSON-LD / DOM selectors)
- **No DOM injection** — Extension no longer inserts any elements into real estate websites, addressing Terms of Service concerns

### Added
- Chrome Side Panel (`sidepanel/sidepanel.html`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`)
- Service worker background script (`background/background.js`) replacing deprecated event page
- Side panel opens automatically when the extension icon is clicked (`setPanelBehavior`)
- Panel updates automatically as the user navigates between property listings (300ms debounce)
- State machine in side panel: Not Supported / Search Page / Non-CA / Loading / Error / Results

### Removed
- `content/content.js` — content script removed entirely
- `content/styles.css` — content styles removed
- `default_popup` from manifest action (required for side panel behavior)

### Technical
- `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` replaces `chrome.action.onClicked`
- `chrome.tabs.onUpdated` + `chrome.tabs.onActivated` for tab monitoring in background
- `utils/cache.js` and `utils/dataFetcher.js` unchanged — reused in side panel context

---

## [1.2.0] - 2025-01

### Added
- **Extreme Precipitation** assessment using Cal-Adapt projected annual rainfall (mid-century 2050–2060)
- **Extreme Heat Days** estimate — projected days above 100°F per year by mid-century
- Five-level risk classification for precipitation (Minimal → Severe based on in/year thresholds)

### Changed
- Improved sea level rise guidance for coastal properties
- Enhanced overall risk score to incorporate all 6 risk indicators

---

## [1.1.0] - 2024-12-22

### Added
- FEMA flood zone data integration using processed California GeoJSON
- Loading indicator for initial flood data fetch (~10–20 seconds)
- Session-based caching for flood zone data (~13MB loaded once per session)
- Point-in-polygon geometry checking for flood zones
- Bounding box optimization for faster flood lookups

### Changed
- Improved performance with bbox rejection testing before full polygon check
- Updated manifest to v1.1.0

### Fixed
- Null geometry handling in flood data
- Coordinate validation before API calls
- Cache version migration issues

### Technical
- Added GitHub Pages hosting for flood zone GeoJSON (~79MB raw → ~13MB processed)
- Implemented `calculateBoundingBox()` for missing bbox data
- Added `hasBoundingBoxIntersection()` for fast spatial queries

---

## [1.0.0] - 2024-12-20

### Added
- Initial release
- Wildfire risk integration with CAL FIRE Fire Hazard Severity Zones
- Extreme heat projections from Cal-Adapt (2050–2060 mid-century, HadGEM2-ES / RCP 8.5)
- Flood risk guidance with links to FEMA Map Service Center
- Sea level rise guidance with links to NOAA Sea Level Rise Viewer
- Color-coded risk indicators (green to red)
- Expandable detail panels with actionable information and source links
- Smart caching system (30-day cache duration, `chrome.storage.local`)
- Geocoding via OpenStreetMap Nominatim with city+ZIP fallback
- California-only property support
- Privacy-focused design — no data collection

### Technical
- Chrome Extension Manifest V3
- Client-side only architecture (no backend server)
- Vanilla JavaScript (no frameworks)
- Parallel API calls for all risk types

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| **1.5.0** | 2026-03-20 | 8 indicators, Current/Projected layout, live FEMA API, fixed heat days |
| **1.4.0** | 2025-02-20 | Multi-site support (6 sites), badge indicator, pin prompt |
| **1.3.0** | 2025-01 | Chrome Side Panel refactor, no DOM modification |
| **1.2.0** | 2025-01 | Extreme Precipitation + Extreme Heat Days |
| **1.1.0** | 2024-12-22 | FEMA flood zone integration |
| **1.0.0** | 2024-12-20 | Initial release |

---

## Security

No security issues reported.

## Acknowledgments

- Cal-Adapt team for comprehensive climate projection APIs
- California Energy Commission for climate data access
- CAL FIRE for fire hazard zone data
- FEMA for flood hazard data
- OpenStreetMap / Nominatim for geocoding
- Open source community for feedback and contributions

---

[Unreleased]: https://github.com/nmatouka/climate-risk-plugin/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/nmatouka/climate-risk-plugin/releases/tag/v1.5.0
[1.4.0]: https://github.com/nmatouka/climate-risk-plugin/releases/tag/v1.4.0
[1.3.0]: https://github.com/nmatouka/climate-risk-plugin/releases/tag/v1.3.0
[1.2.0]: https://github.com/nmatouka/climate-risk-plugin/releases/tag/v1.2.0
[1.1.0]: https://github.com/nmatouka/climate-risk-plugin/releases/tag/v1.1.0
[1.0.0]: https://github.com/nmatouka/climate-risk-plugin/releases/tag/v1.0.0
