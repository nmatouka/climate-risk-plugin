# Climate Risk for Zillow - California

A free, open-source browser extension that displays educational climate risk information for California properties on Zillow, helping homebuyers make informed decisions about climate hazards. This is a proof of concept and should not be relied upon to make purchasing decisions.

[![Extension Demo](docs/demo-screenshot.png)](docs/demo-screenshot.png)

## Features

### Real-Time Climate Data

* **🔥 Wildfire Risk** - Official CAL FIRE Fire Hazard Severity Zones (Minimal, Moderate, High, Very High)
* **🌊 Flood Risk** - FEMA flood zone data from processed National Flood Hazard Layer (NFHL)
* **☀️ Extreme Heat** - Cal-Adapt projections showing mid-century (2050-2060) maximum temperatures
* **📈 Sea Level Rise** - Links to NOAA Sea Level Rise Viewer and California Coastal Commission for coastal properties

### User-Friendly Interface

* Color-coded risk badges (green to red)
* Expandable detail panels with actionable information
* Direct links to authoritative data sources
* Automatic caching (30 days) for faster loading
* Loading indicators for initial flood data fetch

## Installation

### From Chrome Web Store

*Coming soon*

### From Source (Development)

1. Clone this repository:

   ```bash
   git clone https://github.com/nmatouka/climate-risk-plugin.git
   cd climate-risk-plugin
   ```

2. **IMPORTANT:** The `flood-zone-data` folder is **NOT** included in the extension package. It is hosted separately on GitHub Pages for the extension to access. Do not include this folder when loading the extension.

3. Open Chrome and navigate to `chrome://extensions/`

4. Enable "Developer mode" (toggle in top right)

5. Click "Load unpacked"

6. Select the `climate-risk-plugin` directory (NOT the flood-zone-data folder)

7. The extension icon should appear in your toolbar!

## Usage

1. Navigate to a California property on Zillow (individual listing page)
2. The climate risk badge will automatically appear below the property price
3. Click "View Details" to see breakdown by risk type
4. Click source links to verify data on official websites

**Note:** The extension only works on individual property detail pages, not search results pages.

**First Load:** On the first property you view, flood zone data will take 10-20 seconds to load as it downloads the FEMA dataset (~13MB). Subsequent properties will be instant as the data is cached for your browser session.

## Data Sources

All climate risk information comes from authoritative public sources:

| Risk Type | Data Source | Update Frequency |
| --- | --- | --- |
| Wildfire | [CAL FIRE Fire Hazard Severity Zones](https://osfm.fire.ca.gov/) | Updated by state |
| Flood | [FEMA National Flood Hazard Layer (NFHL)](https://hazards.fema.gov/femaportal/NFHL/) | Processed and hosted via GitHub Pages |
| Extreme Heat | [Cal-Adapt Climate Projections](https://cal-adapt.org/) | Climate model data |
| Sea Level Rise | [NOAA Sea Level Rise Viewer](https://coast.noaa.gov/slr/) | User verification required |

### About Flood Data

The flood risk data is derived from FEMA's National Flood Hazard Layer (NFHL) and has been:
- Downloaded for all California counties
- Processed and simplified for web use (~79MB → ~13MB)
- Hosted on GitHub Pages at: `https://nmatouka.github.io/climate-risk-plugin/flood-zone-data/`
- Loaded once per browser session and cached for instant queries

The extension queries this data locally using point-in-polygon geometry checking to determine if a property falls within a FEMA-designated flood zone.

## Privacy

This extension:

* ✅ Does NOT collect any personal information
* ✅ Does NOT track your browsing history
* ✅ Does NOT send data to external servers (except public climate APIs and GitHub Pages for flood data)
* ✅ Caches climate risk data locally for 30 days
* ✅ Only activates on Zillow property pages

## Technical Details

### Architecture

* **Client-side only** - No backend server required
* **Smart caching** - Stores results for 30 days to minimize API calls
* **Geocoding fallback** - Uses OpenStreetMap Nominatim when Zillow data unavailable
* **Parallel API calls** - Fetches all risk data simultaneously for speed
* **Local flood data** - Downloads and caches FEMA GeoJSON once per session

### Technologies Used

* Manifest V3 (Chrome Extension)
* Vanilla JavaScript (no frameworks)
* CAL FIRE ArcGIS REST API
* Cal-Adapt Climate API
* OpenStreetMap Nominatim Geocoding
* FEMA NFHL GeoJSON (hosted on GitHub Pages)
* Point-in-Polygon geometry algorithms

### Performance

* **Initial load:** 10-20 seconds (flood data download on first property)
* **Subsequent loads:** < 1 second (all data cached)
* **Cache duration:** 30 days for climate data, session-based for flood GeoJSON
* **Data size:** ~13MB flood zone data (loaded once per session)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Priority Improvements

1. **Firefox support** - Port to Firefox Add-ons
2. **Flood data optimization** - Further reduce file size or implement regional splitting
3. **Sea level rise data** - Integrate quantitative projections
4. **Improved coordinate extraction** - Better handling of Zillow's dynamic page structure

## Development

### Project Structure

```
climate-risk-plugin/
├── manifest.json           # Extension configuration (v1.1.0)
├── icons/                  # Extension icons
├── content/
│   ├── content.js         # Main content script (with flood loading indicator)
│   └── content.css        # Styling
├── background/
│   └── background.js      # Service worker
├── popup/
│   ├── popup.html         # Extension popup
│   ├── popup.js
│   └── popup.css
├── utils/
│   ├── dataFetcher.js     # API integrations (includes flood zone querying)
│   └── cache.js           # Caching logic
└── flood-zone-data/       # NOT INCLUDED IN EXTENSION
    └── flood_zones_simplified.geojson  # Hosted on GitHub Pages
```

### Important: Flood Data Hosting

The `flood-zone-data` folder contains processed FEMA flood zone data. This folder is:
- ❌ **NOT included in the extension package**
- ✅ **Hosted separately on GitHub Pages**
- ✅ **Accessed by the extension at runtime**

When developing or deploying:
1. Ensure GitHub Pages is enabled for your repository
2. The flood data will be accessible at: `https://[username].github.io/climate-risk-plugin/flood-zone-data/flood_zones_simplified.geojson`
3. Do NOT include the `flood-zone-data` folder when loading the unpacked extension

### Running Tests

```bash
# Load extension in Chrome
# Navigate to chrome://extensions/
# Enable Developer mode
# Load unpacked from project directory (excluding flood-zone-data)
```

### Making Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly on multiple properties
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Updating Flood Data

To update the FEMA flood zone data:

1. Download new NFHL data from [FEMA Map Service Center](https://hazards.fema.gov/femaportal/NFHL/searchResult)
2. Process using the included Python script (see [flood data processing guide](docs/FLOOD_DATA_PROCESSING.md))
3. Replace `flood_zones_simplified.geojson` in the repository
4. Push to GitHub - GitHub Pages will automatically serve the updated file
5. Users will get the new data on their next browser session

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

### Version 1.1.0 (Current)
- ✨ Added FEMA flood zone data integration
- ✨ Added loading indicator for initial flood data fetch
- ✨ Improved performance with session-based caching
- 🐛 Fixed null geometry handling in flood data
- 📝 Updated documentation for flood data hosting

### Version 1.0.0
- 🎉 Initial release
- ✅ Wildfire risk from CAL FIRE
- ✅ Extreme heat from Cal-Adapt
- ✅ Basic flood zone links
- ✅ Sea level rise information

## Disclaimer

**Important:** This information is provided for educational purposes only and should not be the sole basis for real estate decisions.

* Climate risk assessments may not reflect the most current conditions
* Data accuracy varies by location and source
* Professional verification is recommended
* Flood zones require official FEMA verification for insurance
* Consult with qualified professionals before purchasing property

The developers of this extension make no warranties about the accuracy or completeness of this information.

## License

MIT License - See [LICENSE](LICENSE.md) for details

## Acknowledgments

* **California Energy Commission** - Cal-Adapt platform
* **CAL FIRE** - Fire Hazard Severity Zone data
* **FEMA** - National Flood Hazard Layer data
* **NOAA** - Sea level rise projections
* **OpenStreetMap** - Nominatim geocoding service

## Support

* **Bug Reports:** [Open an issue](https://github.com/nmatouka/climate-risk-plugin/issues)
* **Feature Requests:** [Open an issue](https://github.com/nmatouka/climate-risk-plugin/issues)
* **Questions:** [Discussions](https://github.com/nmatouka/climate-risk-plugin/discussions)

---

**Made with 🌍 for a more climate-aware future**

*Star this repo if you find it useful!*