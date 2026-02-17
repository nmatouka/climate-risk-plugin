# Climate Risk for Zillow - California (v1.2.0)

A free, open-source browser extension that displays educational climate risk information for California properties on Zillow, helping homebuyers make informed decisions about climate hazards. This is a proof of concept and should not be relied upon to make purchasing decisions.

![Climate Risk Extension Screenshot](docs/demo-screenshot.png)

## 🆕 Version 1.2.0 - Enhanced Climate Projections

This version adds **two new climate risk indicators** based on Cal-Adapt's future climate projections:

- **🌧️ Extreme Precipitation** - Future heavy rainfall and extreme weather events
- **🔥 Extreme Heat Days** - Projected count of days exceeding temperature thresholds

All new metrics show **mid-century projections (2050-2060)** to help assess long-term climate impacts.

## Features

### Real-Time Climate Data

**Core Risk Indicators:**
* **🔥 Wildfire Risk** - Official CAL FIRE Fire Hazard Severity Zones (Minimal, Moderate, High, Very High)
* **🌊 Flood Risk** - FEMA flood zone data from processed National Flood Hazard Layer (NFHL)
* **☀️ Extreme Heat** - Cal-Adapt projections showing mid-century average maximum temperatures
* **📈 Sea Level Rise** - Coastal vulnerability assessment with links to authoritative resources

**New in v1.2.0:**
* **🌧️ Extreme Precipitation** - Future extreme rainfall events
  - Projects average annual precipitation by mid-century
  - Complements historical FEMA flood zones with climate change impacts
  - Helps assess drainage and stormwater management needs
  - Classification based on total annual rainfall intensity
  
* **🔥 Extreme Heat Days** - Count of days exceeding extreme temperature thresholds
  - Estimates annual days above 100°F by mid-century
  - More tangible than average temperature metrics
  - Helps assess cooling infrastructure and energy needs
  - Important for health considerations and habitability

### User-Friendly Interface

* Color-coded risk badges (green to red)
* Expandable detail panels with actionable information
* Direct links to authoritative data sources
* Automatic caching (30 days) for faster loading
* Loading indicators for initial data fetch
* **NEW:** Enhanced details showing specific projected values

## Installation

### From Chrome Web Store

*Coming soon*

### From Source (Development)

1. Clone this repository:

   ```bash
   git clone https://github.com/nmatouka/climate-risk-plugin.git
   cd climate-risk-plugin
   ```

2. **IMPORTANT:** The `flood-zone-data` folder is **NOT** included in the extension package. It is hosted separately on GitHub Pages for the extension to access.

3. Open Chrome and navigate to `chrome://extensions/`

4. Enable "Developer mode" (toggle in top right)

5. Click "Load unpacked"

6. Select the `climate-risk-plugin` directory (NOT the flood-zone-data folder)

7. The extension icon should appear in your toolbar!

## Usage

1. Navigate to a California property on Zillow (individual listing page)
2. The climate risk badge will automatically appear below the property price
3. Click "View Details" to see breakdown by risk type (6 total risk indicators)
4. Click source links to verify data on official websites

**Note:** The extension only works on individual property detail pages, not search results pages.

**First Load:** On the first property you view, climate data will take 5-15 seconds to load as it queries multiple APIs. Subsequent properties will be faster as data is cached.

## Data Sources

All climate risk information comes from authoritative public sources:

| Risk Type | Data Source | Update Frequency | Timeframe |
| --- | --- | --- | --- |
| Wildfire | [CAL FIRE FHSZ](https://osfm.fire.ca.gov/) | Annual | Current |
| Flood | [FEMA NFHL](https://hazards.fema.gov/femaportal/NFHL/) | Ongoing | Current |
| Extreme Heat | [Cal-Adapt](https://cal-adapt.org/) | Climate projections | 2050-2060 |
| Extreme Heat Days | [Cal-Adapt](https://cal-adapt.org/) | Climate projections | 2050-2060 |
| Extreme Precipitation | [Cal-Adapt](https://cal-adapt.org/) | Climate projections | 2050-2060 |
| Sea Level Rise | [CA Coastal Commission](https://www.coastal.ca.gov/climate/slr/) / [NOAA](https://coast.noaa.gov/slr/) | Manual verification | Varies |

### About Cal-Adapt Data

The Cal-Adapt platform provides downscaled climate projections from global climate models. We use:

- **HadGEM2-ES** climate model under RCP 8.5 emissions scenario
- **Mid-century timeframe** (2050-2060) for consistency
- **Peer-reviewed** methodology from California's Climate Change Assessments
- **Daily resolution data** for temperature and precipitation projections

### About Flood Data

The flood risk data is derived from FEMA's National Flood Hazard Layer (NFHL) and has been:
- Downloaded for all California counties
- Processed and simplified for web use (~79MB → ~13MB)
- Hosted on GitHub Pages
- Loaded once per browser session and cached for instant queries

## Technical Details

### What's New in v1.2.0

**New Features:**
- Added Extreme Precipitation projections (annual rainfall totals)
- Added Extreme Heat Days estimates (days above 100°F)
- Improved sea level rise guidance for coastal properties
- Enhanced error handling and data validation

**Code Improvements:**
- Modular risk classification functions
- Better timeout handling for API calls
- Graceful fallbacks when data unavailable
- Optimized caching strategy

**UI Enhancements:**
- Cleaner detail panel layout
- More specific projection values
- Updated disclaimer text
- Faster initial load times

### Architecture

* **Client-side only** - No backend server required
* **Smart caching** - Stores results for 30 days to minimize API calls
* **Parallel API calls** - Fetches all 6 risk types simultaneously
* **Local flood data** - Downloads GeoJSON once per session
* **Future-focused** - Climate projections show 2050-2060 timeframe

### Performance

* **Initial load:** 5-15 seconds (includes flood data + Cal-Adapt queries)
* **Subsequent loads:** < 2 seconds (all data cached)
* **Cache duration:** 30 days for climate data
* **API calls:** 6 concurrent requests (Cal-Adapt, CAL FIRE, geocoding)

## Implementation Details

### Extreme Precipitation (🌧️)

**Data Source:** Daily precipitation data from Cal-Adapt (HadGEM2-ES, RCP 8.5)
**Method:** Calculates average annual precipitation for 2050-2060 period
**Classification:**
- < 20 inches/year: Minimal
- 20-30 inches/year: Low
- 30-40 inches/year: Moderate (drainage important)
- 40-50 inches/year: High (enhanced protection needed)
- 50+ inches/year: Severe (significant mitigation essential)

**Note:** This metric shows total precipitation trends, which differs from FEMA flood zones that map specific inundation areas based on historical flooding events.

### Extreme Heat Days (🔥)

**Data Source:** Daily maximum temperature from Cal-Adapt (HadGEM2-ES, RCP 8.5)
**Method:** Estimates annual days exceeding 100°F (37.8°C) threshold
**Classification:**
- < 10 days/year: Minimal
- 10-30 days/year: Low (adequate cooling sufficient)
- 30-60 days/year: Moderate (reliable AC essential)
- 60-90 days/year: High (high-capacity cooling critical)
- 90+ days/year: Severe (habitability concerns)

**Note:** Uses statistical estimation from average daily maximums rather than counting individual days above threshold (would require much larger data downloads).

### Sea Level Rise (📈)

**Data Source:** California Coastal Commission projections, NOAA guidance
**Method:** Detects coastal properties (within 10 miles of coast)
**Response:**
- Non-coastal: "Not applicable"
- Coastal: "Verify risk" with guidance to check NOAA Sea Level Rise Viewer

**California Projection:** 10-12 inches of rise by 2050 (state guidance)

**Note:** Sea level rise projections require detailed elevation data and inundation modeling. Users are directed to NOAA's Sea Level Rise Viewer for property-specific analysis.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Priority Improvements for Future Versions

1. **Drought and air quality data** - Add when Cal-Adapt makes PDSI and smoke day projections available via API
2. **More accurate heat days** - Query full daily data instead of statistical estimation
3. **Landslide risk** - Integrate USGS data with precipitation patterns
4. **Water stress indicators** - Add reservoir/groundwater projections
5. **Firefox support** - Port extension to Firefox Add-ons

### Good First Issues

- 📝 **Documentation** - Add API examples, troubleshooting guides
- 🎨 **UI polish** - Improve mobile display, add animations
- 🧪 **Testing** - Add unit tests for risk classification
- 🐛 **Bug fixes** - Check issues labeled "good first issue"

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for complete version history.

### Version 1.2.0 (Current)
- ✨ Added Extreme Precipitation assessment (annual rainfall projections)
- ✨ Added Extreme Heat Days estimates (days above 100°F)
- 🔧 Improved sea level rise guidance for coastal properties
- 📈 Enhanced overall risk calculation with new metrics
- 📝 Updated documentation and data source attribution
- 🎨 Refined detail panel layout

### Version 1.1.0
- ✨ Added FEMA flood zone integration
- ✨ Added loading indicators
- 🐛 Fixed performance issues
- 📝 Updated documentation

### Version 1.0.0
- 🎉 Initial release
- ✅ Wildfire, flood, heat, sea level rise

### Future Enhancements
- **Drought Risk** - Pending Cal-Adapt PDSI API availability
- **Air Quality** - Pending Cal-Adapt smoke days API availability

## Disclaimer

**Important:** This information is provided for educational purposes only and should not be the sole basis for real estate decisions.

* Climate risk assessments show **projections**, not guarantees
* Mid-century data (2050-2060) represents one emissions scenario (RCP 8.5)
* Data accuracy varies by location and source
* Professional verification is recommended for all risk assessments
* Flood zones require official FEMA verification for insurance purposes
* Sea level rise impacts depend on property elevation and local conditions
* Consult with qualified professionals before purchasing property

The developers of this extension make no warranties about the accuracy or completeness of this information.

## License

MIT License - See [LICENSE](LICENSE.md) for details

## Acknowledgments

* **California Energy Commission** - Cal-Adapt platform and climate data
* **CAL FIRE** - Fire Hazard Severity Zone data
* **FEMA** - National Flood Hazard Layer data
* **California Coastal Commission** - Sea level rise guidance and projections
* **NOAA** - Sea level rise viewer and coastal data
* **OpenStreetMap** - Nominatim geocoding service
* **California's Climate Change Program** - Scientific guidance and research

## Support

* **Bug Reports:** [Open an issue](https://github.com/nmatouka/climate-risk-plugin/issues)
* **Feature Requests:** [Open an issue](https://github.com/nmatouka/climate-risk-plugin/issues)
* **Questions:** [Discussions](https://github.com/nmatouka/climate-risk-plugin/discussions)

---

**Made with 🌍 for a more climate-aware future**

*Version 1.2.0 - Now with enhanced precipitation and heat projections*

*Star this repo if you find it useful!*
