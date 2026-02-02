# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- More accurate extreme heat days calculation (query daily data)
- Water scarcity/supply risk metrics
- Landslide risk integration with USGS data
- Firefox browser support
- Additional state coverage
- Property comparison feature
- Export risk reports as PDF
- Regional flood data splitting for faster loads

## [2.0.0] - 2025-01-31

### Added - Tier 1 Climate Threats
- **Drought Risk assessment** using Palmer Drought Severity Index (PDSI) from Cal-Adapt
  - Shows mid-century (2050-2060) drought projections
  - 5-level risk classification (Minimal to Severe)
  - Helps assess future water availability
  
- **Air Quality degradation projections** using smoke days from Cal-Adapt
  - Projects wildfire smoke impact on air quality
  - Shows estimated poor air quality days per year
  - Graceful fallback if API endpoint unavailable
  
- **Extreme Precipitation risk** using Cal-Adapt precipitation data
  - Shows future rainfall intensity changes
  - Different from historical FEMA flood zones
  - Helps assess need for enhanced drainage
  
- **Extreme Heat Days counter** enhancement to existing heat metric
  - Estimates days above 100°F threshold
  - More user-friendly than average temperatures
  - Based on Cal-Adapt temperature projections

### Changed
- Enhanced overall risk calculation to include all 8 climate threats
- Updated UI detail panel to show all Tier 1 risks
- Improved loading messages to mention new data sources
- Extended cache structure to support additional risk types
- Updated disclaimer to mention mid-century projections

### Improved
- Better error handling for Cal-Adapt API calls
- Modular risk classification functions for maintainability
- Enhanced logging with emoji prefixes for each risk type
- Performance optimization for parallel API fetching
- More detailed risk descriptions with specific values

### Technical
- Added `CLIMATE_CONSTANTS` object for centralized configuration
- New Cal-Adapt data slug support (PDSI, precipitation, smoke days)
- Enhanced `fetchAllRisks()` to handle 8 concurrent API calls
- Timeout protection for all API requests
- Graceful degradation when APIs unavailable

### Documentation
- Comprehensive README update explaining Tier 1 features
- Added technical details for each new risk type
- Updated data sources table with timeframes
- Enhanced installation and usage instructions
- Added Tier 1 implementation details section

## [1.1.0] - 2024-12-22

### Added
- FEMA flood zone data integration using processed GeoJSON
- Loading indicator for initial flood data fetch (~10-20 seconds)
- Session-based caching for flood zone data
- Point-in-polygon geometry checking for flood zones
- Bounding box optimization for faster flood lookups

### Changed
- Improved performance with bbox rejection testing
- Updated manifest to v1.1.0
- Enhanced README with flood data processing information

### Fixed
- Null geometry handling in flood data
- Coordinate validation before API calls
- Cache version migration issues

### Technical
- Added GitHub Pages hosting for flood zone GeoJSON (~13MB)
- Implemented `calculateBoundingBox()` for missing bbox data
- Added `hasBoundingBoxIntersection()` for fast spatial queries
- Performance metrics logging for flood zone checks

## [1.0.0] - 2024-12-20

### Added
- Initial release
- Wildfire risk integration with CAL FIRE Fire Hazard Severity Zones
- Extreme heat projections from Cal-Adapt (2050-2060 mid-century data)
- Flood risk guidance with links to FEMA Map Service Center
- Sea level rise guidance with links to NOAA Sea Level Rise Viewer
- Color-coded risk badges (green to red)
- Expandable detail panels with actionable information
- Smart caching system (30-day cache duration)
- Geocoding fallback using OpenStreetMap Nominatim
- California-only property support
- Direct links to authoritative data sources
- Privacy-focused design (no data collection)

### Features
- Automatic property detection on Zillow detail pages
- Parallel API calls for fast data retrieval
- Graceful error handling and fallbacks
- Console logging for debugging (emoji-prefixed)
- Extension popup with information and links

### Data Sources
- CAL FIRE for wildfire hazard zones
- Cal-Adapt for climate projections
- OpenStreetMap Nominatim for geocoding
- FEMA (user-directed) for flood zones
- NOAA (user-directed) for sea level rise

### Technical
- Chrome Extension Manifest V3
- Client-side only architecture (no backend)
- Vanilla JavaScript (no frameworks)
- Local storage for caching
- CORS-compliant API integrations

## Release Notes

### v2.0.0 Notes - Tier 1 Enhancements

This major update adds **four new forward-looking climate risk indicators** to help users understand mid-century (2050-2060) climate impacts:

**What's New:**
- ✅ Drought risk projections (Palmer Drought Severity Index)
- ✅ Air quality degradation estimates (smoke days)
- ✅ Extreme precipitation intensity projections
- ✅ Extreme heat days frequency (enhancement)
- ✅ Enhanced risk detail panel with 8 total risks
- ✅ More specific projection values shown
- ✅ Improved error handling and fallbacks

**Data Quality:**
All new metrics use Cal-Adapt's downscaled climate projections from the HadGEM2-ES model under RCP 8.5 emissions scenario, following guidance from California's Climate Change Assessments.

**Performance:**
- First load: 10-30 seconds (6-8 parallel API calls)
- Cached: < 2 seconds
- All data cached for 30 days

**Known Limitations:**
- Air quality endpoint may not be available in all Cal-Adapt versions (graceful fallback)
- Extreme heat days are estimated from averages (future: query daily data)
- California properties only
- Chrome browser only (Firefox support planned)

### v1.1.0 Notes

Added comprehensive FEMA flood zone integration with local GeoJSON processing.

**What Works:**
- ✅ Accurate flood zone determination for any CA property
- ✅ Fast lookups with bounding box optimization
- ✅ Session-based caching (13MB loaded once)
- ✅ Detailed FEMA zone classifications

**Performance:**
- First property: 10-20 seconds (flood data download)
- Subsequent: Instant (session cache)

### v1.0.0 Notes

Initial public release providing real-time climate risk data for California properties.

**What Works:**
- ✅ Wildfire risk from official CAL FIRE data
- ✅ Extreme heat projections from Cal-Adapt
- ✅ Helpful links for flood and sea level rise data
- ✅ Smart caching to minimize API calls
- ✅ Clean, intuitive user interface

**Known Limitations:**
- California properties only
- Chrome browser only
- Flood data requires manual FEMA verification (fixed in v1.1.0)
- Sea level rise requires manual NOAA verification
- Requires geocoding for properties without embedded coordinates

## Version History

- **2.0.0** (2025-01-31) - Tier 1 climate threat enhancements
- **1.1.0** (2024-12-22) - FEMA flood zone integration
- **1.0.0** (2024-12-20) - Initial release

## Migration Notes

### Migrating from v1.x to v2.0

**Cache Migration:**
- v2.0 uses updated cache structure with version field
- Old caches will be automatically invalidated
- First property after upgrade will re-fetch all data

**No Breaking Changes:**
- All v1.x features still work
- New Tier 1 risks add to existing data
- UI automatically shows new risks when available

**API Changes:**
- `fetchAllRisks()` now returns 8 risk types instead of 4
- Risk data structure unchanged (backwards compatible)
- New fields: `drought`, `airQuality`, `extremePrecipitation`, `extremeHeatDays`

### Migrating from v1.0 to v1.1

**Flood Data:**
- v1.0: Links to FEMA Map Service Center
- v1.1: Integrated local flood zone checking

**No Action Required:**
- Automatic upgrade
- Extension will download flood data on first use

## Security

No security issues reported.

## Acknowledgments

Special thanks to:
- Cal-Adapt team for comprehensive climate projection APIs
- California Energy Commission for climate data access
- CAL FIRE for fire hazard zone data
- FEMA for flood hazard data
- Open source community for feedback and contributions

---

[Unreleased]: https://github.com/nmatouka/climate-risk-plugin/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/nmatouka/climate-risk-plugin/releases/tag/v2.0.0
[1.1.0]: https://github.com/nmatouka/climate-risk-plugin/releases/tag/v1.1.0
[1.0.0]: https://github.com/nmatouka/climate-risk-plugin/releases/tag/v1.0.0
