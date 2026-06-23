# Climate Risk - California (v1.6.0)

A free, open-source Chrome extension that displays educational climate risk information for California real estate properties, helping homebuyers make informed decisions about climate hazards. This is a proof of concept and should not be relied upon to make purchasing decisions.

![Climate Risk Extension Screenshot](docs/demo-screenshot.png)

## Features

### Current Conditions

* **🔥 Wildfire** — Official CAL FIRE Fire Hazard Severity Zones, queried across both State (SRA) and Local (LRA) Responsibility Areas
* **🌊 Flood** — FEMA National Flood Hazard Layer (NFHL), live point query including SFHA designation

### Mid-Century Projections (CMIP6 LOCA2, 5-model ensemble, SSP3-7.0, 2050–2059)

* **🔥 Wildfire Probability** — Cal-Adapt / UC Merced decadal wildfire occurrence probability
* **🌊 Projected Flood** — FEMA Future Conditions Flood Hazard data (FC-FIRM), extracted from the same NFHL response
* **☀️ Extreme Heat** — CMIP6 LOCA2 projected average annual peak temperature (ensemble median + p10–p90 range)
* **🔆 Extreme Heat Days** — CMIP6 LOCA2 projected days/year above the local historical 95th-percentile temperature
* **🌧️ Precipitation Change** — CMIP6 LOCA2 projected % change in average annual precipitation vs. 1981–2010
* **📈 Sea Level Rise** — Nearest NOAA tide gauge (NOAA NOS TR 01 2022 / OPC 2024 planning standard)

### Regional Multi-Hazard Index

* **📊 FEMA National Risk Index** — present-day risk percentiles per census tract across wildfire, inland flooding, earthquake, landslide, extreme heat, and more (FEMA NRI Dec 2025 v1.20)

The side panel groups risks into **Current Conditions**, **Mid-Century Projections**, and **Regional Hazard Index (FEMA NRI)** sections, each with an aggregate risk level badge, plus a headline **Now → 2050** summary showing whether projected risk is higher or lower than current conditions.

### Supported Real Estate Websites

* Zillow
* Realtor.com
* Redfin
* Trulia
* Compass
* Homes.com

### How It Works

The extension reads the property address directly from the browser URL bar — it does not modify or scrape any real estate website. Climate risk data is displayed in a **Chrome Side Panel** that sits alongside the page without interfering with it.

* When you navigate to a supported property listing, the extension icon shows a badge (!)
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
2. The extension icon shows a badge (!) when you're on a supported property page
3. Click the icon to open the Climate Risk side panel
4. The panel displays 8 risk indicators grouped into Current Conditions and Mid-Century Projections sections
5. The panel updates automatically as you navigate to other property listings

**Note:** The extension only processes California properties. Non-CA properties will show an informational message.

**First Load:** The first time you view a property, climate data takes 5–15 seconds to load as it queries multiple APIs. Subsequent properties load faster as data is cached for 30 days.

## Data Sources

All climate risk information comes from authoritative public sources:

| Risk Type | Data Source | Timeframe |
|---|---|---|
| Wildfire | [CAL FIRE FHSZ](https://osfm.fire.ca.gov/) (SRA + LRA layers) | Current |
| Flood | [FEMA NFHL](https://hazards.fema.gov/) Layer 28 | Current |
| Wildfire Probability | [Cal-Adapt / UC Merced](https://cal-adapt.org/) | 2050s decade |
| Projected Flood | [FEMA FC-FIRM](https://hazards.fema.gov/) (NFHL ZONE_SUBTY) | Future conditions |
| Extreme Heat | CMIP6 LOCA2 ([Cal-Adapt](https://cal-adapt.org/)) via Climateshed microservice | 2050–2059 |
| Extreme Heat Days | CMIP6 LOCA2 via Climateshed microservice | 2050–2059 |
| Precipitation Change | CMIP6 LOCA2 via Climateshed microservice | 2050–2059 vs 1981–2010 |
| Sea Level Rise | [NOAA NOS TR 01 2022](https://oceanservice.noaa.gov/hazards/sealevelrise/) (OPC 2024 standard) | 2050 / 2100 |
| Multi-hazard Index | [FEMA National Risk Index](https://hazards.fema.gov/nri/) (Dec 2025 v1.20) | Present-day |

### About the CMIP6 Projection Data

Mid-century projections come from the **Climateshed CMIP6 microservice** (reached through a small Cloudflare-Worker proxy — see [`climate-proxy/`](climate-proxy/)). This extension uses:

- **LOCA2-downscaled CMIP6** projections, a **5-model ensemble** (median reported with the p10–p90 spread)
- **SSP3-7.0** high-emissions scenario, **mid-century** window (2050–2059)
- The same precomputed statistics that power Climateshed Intelligence

This replaces the previous direct Cal-Adapt CMIP5 (HadGEM2-ES, RCP 8.5) queries. The wildfire 2050 probability is still sourced directly from Cal-Adapt (UC Merced), which the microservice does not provide.

### About Flood Data

Flood data is queried live from FEMA's National Flood Hazard Layer (NFHL) REST API (Layer 28). A single point query returns both the current flood zone (`FLD_ZONE`, `SFHA_TF`) and any Future Conditions designations (`ZONE_SUBTY` containing "FUTURE"), enabling both the Flood and Projected Flood cards from one network request. FEMA's service can return multiple overlapping polygons for a point — the extension selects the highest-risk feature.

## Technical Details

### Architecture

* **Browser Side Panel** — Climate risk data is displayed in Chrome's native side panel, completely separate from the real estate website
* **URL-based address detection** — Property addresses are read from the browser URL bar, not from page content
* **Hybrid data layer** — Current wildfire (CAL FIRE), flood (FEMA NFHL), and wildfire 2050 probability (Cal-Adapt) are queried directly; CMIP6 projections, sea level rise, and FEMA NRI come from the Climateshed microservice via a small Cloudflare-Worker proxy ([`climate-proxy/`](climate-proxy/)) that holds the API key and sets CORS
* **Smart caching** — Results stored for 30 days client-side; the proxy also caches each point 24 h at the edge
* **Parallel calls** — Wildfire, wildfire projection, flood, and the Climateshed batch run concurrently; CMIP6 + SLR + NRI share one proxy request
* **Geocoding** — Addresses geocoded via OpenStreetMap Nominatim to obtain coordinates
* **Layout** — Risks grouped into Current Conditions, Mid-Century Projections, and a FEMA NRI section, with aggregate badges and a Now → 2050 headline summary

### Performance

* **Initial load:** ~3–8 seconds (the microservice serves precomputed CMIP6 statistics — no live daily-data download)
* **Subsequent loads:** < 2 seconds (all data cached client-side)
* **Cache duration:** 30 days (client) / 24 h (edge proxy)

### Risk Classification Details

**Wildfire Probability** (10-year occurrence probability, 2050s decade)
- < 3%: Minimal
- 3–6.9%: Low
- 7–14.9%: Moderate
- 15–24.9%: High
- ≥ 25%: Severe

**Projected Flood** (FEMA FC-FIRM future conditions)
- 1%-annual-chance future zone: High
- 0.2%-annual-chance future zone: Moderate
- Other future designation: Low
- Not mapped: Unavailable (FC-FIRM coverage is expanding)

**Extreme Heat Days** (days/year above the local historical 95th-percentile temperature, CMIP6 ensemble median)
- < 18 days/year: Minimal (≈ the historical baseline)
- 18–29 days/year: Low
- 30–54 days/year: Moderate
- 55–79 days/year: High
- ≥ 80 days/year: Severe

**Precipitation Change** (% change in average annual precipitation vs. 1981–2010, classified by magnitude; copy describes direction — wetter → runoff/flood, drier → drought stress)
- < 2% change: Minimal
- 2–5%: Low
- 5–10%: Moderate
- 10–20%: High
- ≥ 20%: Severe

**Sea Level Rise** — Uses the nearest NOAA tide gauge (within ~100 km of the California coast; ~150 km in the tidally-connected Delta). Reports NOAA NOS TR 01 2022 projections under the OPC 2024 planning standard. Severity reflects the regional intermediate-scenario rise by 2100; the card is explicitly regional, not a property-specific elevation assessment.

## Privacy

This extension processes property addresses and coordinates solely to display climate risk data. No personal data is collected, shared, or transmitted to third parties beyond the public APIs listed above. All cached data is stored locally on your device.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Priority Improvements for Future Versions

The CMIP6 microservice already returns several datasets the side panel does not yet display — these are the lowest-hanging fruit:

1. **Drought, environmental justice & heat vulnerability** — Surface US Drought Monitor, CalEnviroScreen 4.0, CalHeatScore, and Census LACE air-conditioning access (already in the microservice `/point/all`)
2. **SSP scenario toggle** — Let users switch between SSP2-4.5, SSP3-7.0, and SSP5-8.5
3. **Property-level sea level rise** — Combine the NOAA-gauge projections with parcel elevation for site-specific inundation
4. **Groundwater & water stress** — Add CASGEM depth/trend and basin data
5. **Additional state coverage** — Expand CMIP6/NRI coverage beyond California

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for complete version history.

### v1.6.0 (2026-06-22)
- ✨ Migrated mid-century projections to **CMIP6 LOCA2** (5-model ensemble, SSP3-7.0, 2050–2059) via the Climateshed microservice — replaces direct Cal-Adapt CMIP5 (HadGEM2-ES, RCP 8.5)
- ✨ Added **FEMA National Risk Index** multi-hazard section (wildfire, inland flooding, earthquake, landslide, extreme heat, …)
- ✨ Heat / heat days / precipitation now show the **p10–p90 ensemble range**
- 🌊 Sea level rise now uses the **nearest NOAA tide gauge** (OPC 2024 standard) instead of a bbox + USGS-elevation heuristic
- 🌧️ Precipitation card is now **% change vs 1981–2010** (renamed Precipitation Change)
- 🔌 Added `climate-proxy/` Cloudflare Worker so the client extension reaches the microservice without shipping the API key
- 🧹 Removed orphaned `popup/`, dead `flood-zone-data/`, and redundant `gitignore.txt`; fixed a `datafetcher.js` script-casing bug

### v1.5.0 (2026-03-20)
- ✨ Added Wildfire Probability (Cal-Adapt / UC Merced 2050s decadal probability)
- ✨ Added Projected Flood via FEMA FC-FIRM future conditions (from same NFHL request)
- ✨ Replaced local flood GeoJSON with live FEMA NFHL REST API
- ✨ Dual-layer wildfire query (SRA + LRA) for complete CAL FIRE FHSZ coverage
- ✨ Current vs. Projected layout with aggregate risk badges per section
- ✨ Now → 2050 headline summary row showing whether projected risk is higher or lower
- 🔧 Fixed Extreme Heat Days to use actual Cal-Adapt daily data (95°F threshold)
- 🔧 Fixed Extreme Precipitation unit conversion and recalibrated thresholds

### v1.5.2 (2026-04-08)
- 🐛 Fixed NOAA 2100 sea level rise figure — corrected from 3.5 ft to ~7 ft (high scenario, NOAA 2022 TR)
- 🐛 Fixed USGS elevation: large negative values (-1000000) for water/unmapped pixels now treated as unavailable
- 🌡️ Extreme Heat Days now uses local historical 95th-percentile temperature threshold (Cal-Adapt 1981–2010 baseline) instead of fixed 95°F — coastal and mild-climate locations now correctly show higher risk
- 🌧️ Extreme Precipitation classification thresholds recalibrated to ClimateShed validated values; wet day minimum raised from 0.1 to 1 mm/day
- 🔥 Wildfire "not in FHSZ" detail text corrected — clarifies this is a regulatory classification, not a fire risk assessment
- 🌊 Sea level rise elevation tiers aligned to ClimateShed validated thresholds (≤3 ft Severe, 3–10 High, 10–20 Moderate, 20–50 Low, >50 Minimal)
- 🌊 Sea level rise 2050 range updated to 0.8–1.5 ft (intermediate to intermediate-high scenarios)

### v1.5.1 (2026-04-01)
- 🐛 Fixed flood zone 0.2% (500-year) classification — Moderate level was never shown due to wrong field check
- 🌊 Sea level rise now fetches property elevation (USGS 3DEP); low-elevation properties show inundation severity; elevated properties show cliff/bluff erosion caveat
- 🌧️ Extreme Precipitation now counts days exceeding the local historical 95th percentile wet-day threshold (Cal-Adapt 1981–2010 baseline), not total annual rainfall
- ⚠️ FC-FIRM projected flood description now clarifies it reflects land-use changes, not climate projections
- 📊 Mid-Century Projections section now discloses model (HadGEM2-ES) and scenario (RCP 8.5)
- 🗺️ ZIP-centroid geocoding fallback now shows a visible accuracy warning in results

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
