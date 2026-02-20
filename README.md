# Climate Risk - California (v1.4.0)

A free, open-source Chrome extension that displays educational climate risk information for California real estate properties, helping homebuyers make informed decisions about climate hazards. This is a proof of concept and should not be relied upon to make purchasing decisions.

![Climate Risk Extension Screenshot](docs/demo-screenshot.png)

## Features

### Climate Risk Indicators

* **🔥 Wildfire Risk** — Official CAL FIRE Fire Hazard Severity Zones (Minimal, Moderate, High, Very High)
* **🌊 Flood Risk** — FEMA flood zone data from the National Flood Hazard Layer (NFHL)
* **☀️ Extreme Heat** — Cal-Adapt projections of mid-century average maximum temperatures
* **🔆 Extreme Heat Days** — Estimated annual days above 100°F by mid-century
* **🌧️ Extreme Precipitation** — Projected average annual rainfall by mid-century
* **📈 Sea Level Rise** — Coastal vulnerability assessment with links to authoritative resources

All forward-looking metrics show **mid-century projections (2050–2060)** under the RCP 8.5 emissions scenario.

### Supported Real Estate Websites

* Zillow
* Realtor.com
* Redfin
* Trulia
* Compass
* Homes.com

### How It Works

The extension reads the property address directly from the browser URL bar — it does not modify or scrape any real estate website. Climate risk data is displayed in a **Chrome Side Panel** that sits alongside the page without interfering with it.

* When you navigate to a supported property listing, the extension icon shows a badge dot (●)
* Click the icon to open the Climate Risk side panel
* The panel loads automatically and updates as you navigate between listings

## Installation

### From Chrome Web Store

Search for **"Climate Risk - California"** in the [Chrome Web Store](https://chrome.google.com/webstore/), or install directly from your published listing URL.

### From Source (Development)

1. Clone this repository:

   ```bash
   git clone https://github.com/nmatouka/climate-risk-plugin.git
   cd climate-risk-plugin
   ```

2. **Note:** The `flood-zone-data` folder is **not** included in the extension package. It is hosted separately on GitHub Pages for the extension to access.

3. Open Chrome and navigate to `chrome://extensions/`

4. Enable **Developer mode** (toggle in top right)

5. Click **Load unpacked** and select the `climate-risk-plugin` directory

6. **Pin the extension** to your toolbar: click the 🧩 puzzle piece → find Climate Risk → click 📌 pin

## Usage

1. Navigate to an individual property listing on a supported real estate website
2. The extension icon shows a badge dot (●) when you're on a supported property page
3. Click the icon to open the Climate Risk side panel
4. The panel displays all 6 risk indicators with details and source links
5. The panel updates automatically as you navigate to other property listings

**Note:** The extension only processes California properties. Non-CA properties will show an informational message.

**First Load:** The first time you view a property, climate data takes 5–15 seconds to load as it queries multiple APIs. Subsequent properties load faster as data is cached for 30 days.

## Data Sources

All climate risk information comes from authoritative public sources:

| Risk Type | Data Source | Timeframe |
|---|---|---|
| Wildfire | [CAL FIRE FHSZ](https://osfm.fire.ca.gov/) | Current |
| Flood | [FEMA NFHL](https://hazards.fema.gov/femaportal/NFHL/) | Current |
| Extreme Heat | [Cal-Adapt](https://cal-adapt.org/) | 2050–2060 |
| Extreme Heat Days | [Cal-Adapt](https://cal-adapt.org/) | 2050–2060 |
| Extreme Precipitation | [Cal-Adapt](https://cal-adapt.org/) | 2050–2060 |
| Sea Level Rise | [CA Coastal Commission](https://www.coastal.ca.gov/climate/slr/) / [NOAA](https://coast.noaa.gov/slr/) | Varies |

### About Cal-Adapt Data

The Cal-Adapt platform provides downscaled climate projections from global climate models. This extension uses:

- **HadGEM2-ES** climate model under RCP 8.5 emissions scenario
- **Mid-century timeframe** (2050–2060) for consistency
- **Peer-reviewed** methodology from California's Climate Change Assessments

### About Flood Data

The flood risk data is derived from FEMA's National Flood Hazard Layer (NFHL) and has been:
- Downloaded for all California counties
- Processed and simplified for web use (~79MB → ~13MB)
- Hosted on GitHub Pages and loaded once per browser session

## Technical Details

### Architecture

* **Browser Side Panel** — Climate risk data is displayed in Chrome's native side panel, completely separate from the real estate website
* **URL-based address detection** — Property addresses are read from the browser URL bar, not from page content
* **Client-side only** — No backend server required
* **Smart caching** — Results stored for 30 days to minimize API calls
* **Parallel API calls** — All 6 risk types fetched simultaneously
* **Geocoding** — Addresses geocoded via OpenStreetMap Nominatim to obtain coordinates

### Performance

* **Initial load:** 5–15 seconds (includes flood data + Cal-Adapt queries)
* **Subsequent loads:** < 2 seconds (all data cached)
* **Cache duration:** 30 days

### Risk Classification Details

**Extreme Precipitation**
- < 20 in/year: Minimal
- 20–30 in/year: Low
- 30–40 in/year: Moderate
- 40–50 in/year: High
- 50+ in/year: Severe

**Extreme Heat Days** (estimated days above 100°F)
- < 10 days/year: Minimal
- 10–30 days/year: Low
- 30–60 days/year: Moderate
- 60–90 days/year: High
- 90+ days/year: Severe

**Sea Level Rise** — Detects coastal properties (within ~10 miles of coast) and links to NOAA's Sea Level Rise Viewer for property-specific inundation analysis. California projects 10–12 inches of rise by 2050.

## Privacy

This extension processes property addresses and coordinates solely to display climate risk data. No personal data is collected, shared, or transmitted to third parties beyond the public APIs listed above. All cached data is stored locally on your device.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Priority Improvements for Future Versions

1. **Drought and air quality data** — Add when Cal-Adapt makes PDSI and smoke day projections available via API
2. **More accurate heat days** — Query full daily data instead of statistical estimation
3. **Landslide risk** — Integrate USGS data
4. **Water stress indicators** — Add reservoir/groundwater projections
5. **Additional state coverage** — Expand beyond California

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for complete version history.

### v1.4.0 (2025-02-20)
- ✨ Expanded to Realtor.com, Redfin, Trulia, Compass, and Homes.com
- 🔔 Extension icon badge indicates when a supported property page is active
- 🔔 First-install notification prompts user to pin extension
- 🐛 Fixed Trulia `/home/` and Compass `_pid` URL formats

### v1.3.0
- 🏗️ Refactored to Chrome Side Panel — no modification of real estate websites
- 📍 Property addresses now read from the browser URL bar
- 🔒 Removed all content script DOM injection

### v1.2.0
- ✨ Added Extreme Precipitation assessment
- ✨ Added Extreme Heat Days estimates
- 🔧 Improved sea level rise guidance for coastal properties

### v1.1.0
- ✨ Added FEMA flood zone integration
- ✨ Added loading indicators

### v1.0.0
- 🎉 Initial release — Wildfire, flood, heat, sea level rise

## Disclaimer

**Important:** This information is provided for educational purposes only and should not be the sole basis for real estate decisions.

* Climate risk assessments show **projections**, not guarantees
* Mid-century data (2050–2060) represents one emissions scenario (RCP 8.5)
* Data accuracy varies by location and source
* Professional verification is recommended for all risk assessments
* Flood zones require official FEMA verification for insurance purposes
* Sea level rise impacts depend on property elevation and local conditions
* Consult with qualified professionals before purchasing property

The developers of this extension make no warranties about the accuracy or completeness of this information.

## License

MIT License — See [LICENSE](LICENSE.md) for details

## Acknowledgments

* **California Energy Commission** — Cal-Adapt platform and climate data
* **CAL FIRE** — Fire Hazard Severity Zone data
* **FEMA** — National Flood Hazard Layer data
* **California Coastal Commission** — Sea level rise guidance
* **NOAA** — Sea level rise viewer and coastal data
* **OpenStreetMap** — Nominatim geocoding service

## Support

* **Bug Reports:** [Open an issue](https://github.com/nmatouka/climate-risk-plugin/issues)
* **Feature Requests:** [Open an issue](https://github.com/nmatouka/climate-risk-plugin/issues)
* **Questions:** [Discussions](https://github.com/nmatouka/climate-risk-plugin/discussions)

---

*Made with 🌍 for a more climate-aware future*
