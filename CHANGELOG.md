# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Firefox browser support
- Additional state coverage
- Property comparison feature
- Historical trend analysis
- Export risk reports as PDF

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

### v1.0.0 Notes

This is the initial public release of the Climate Risk for Zillow extension. The extension provides real-time climate risk data for California properties listed on Zillow.

**What Works:**
- ✅ Wildfire risk from official CAL FIRE data
- ✅ Extreme heat projections from Cal-Adapt
- ✅ Helpful links for flood and sea level rise data
- ✅ Smart caching to minimize API calls
- ✅ Clean, intuitive user interface

**Known Limitations:**
- California properties only
- Flood data requires manual FEMA verification (API has CORS restrictions)
- Sea level rise requires manual NOAA verification (complex raster data)
- Chrome browser only (Firefox support planned)
- Requires geocoding for properties without embedded coordinates

**Browser Compatibility:**
- Chrome/Chromium: ✅ Supported
- Firefox: ❌ Not yet supported (planned for v1.1)
- Safari: ❌ Not supported
- Edge: ✅ Should work (Chromium-based, untested)

**System Requirements:**
- Chrome browser version 88 or higher
- Internet connection (for API calls)
- Zillow.com access

### Migration Notes

No migrations needed for initial release.

### Security

No security issues reported.

---

## Version History

- **1.0.0** (2024-12-20) - Initial release

[Unreleased]: https://github.com/yourusername/zillow-climate-risk/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yourusername/zillow-climate-risk/releases/tag/v1.0.0