# Chrome Web Store — Listing Copy (v1.6.0)

Copy-paste these into the Chrome Web Store Developer Dashboard. Field names match the dashboard.

---

## Product name
```
Climate Risk - California
```

## Summary (short description — 132 char max)
```
Wildfire, flood, CMIP6 heat & climate projections + FEMA risk for California homes — on Zillow, Redfin, Realtor.com & more.
```
*(Pulled from `manifest.json` "description" by default; 124 characters.)*

## Category
**Primary:** News & Weather  *(alternative: Productivity)*

## Language
English (United States)

---

## Detailed description
```
Climate Risk - California shows educational climate-risk information for the home you're looking at — right alongside the listing, in Chrome's side panel.

When you open a California property on Zillow, Redfin, Realtor.com, Trulia, Compass, or Homes.com, click the extension to see how that location scores across present-day hazards and mid-century climate projections. The extension never modifies the real-estate site — it reads the address from the page URL and shows everything in a separate side panel.

CURRENT CONDITIONS
• Wildfire — official CAL FIRE Fire Hazard Severity Zones (state + local responsibility areas)
• Flood — FEMA National Flood Hazard Layer, including Special Flood Hazard Area status

MID-CENTURY PROJECTIONS (2050–2059)
Powered by CMIP6 LOCA2 downscaled climate models — a 5-model ensemble under the SSP3-7.0 high-emissions scenario, with the median and the model spread shown for each metric:
• Extreme Heat — projected average annual peak temperature
• Extreme Heat Days — days per year above the local historical 95th-percentile temperature
• Precipitation Change — projected change in annual precipitation vs. the 1981–2010 baseline
• Wildfire Probability — Cal-Adapt / UC Merced decadal wildfire occurrence probability
• Projected Flood — FEMA Future Conditions (FC-FIRM), where mapped
• Sea Level Rise — nearest NOAA tide gauge, NOAA 2022 projections under the OPC 2024 California planning standard

REGIONAL HAZARD INDEX
• FEMA National Risk Index — present-day risk percentiles for wildfire, inland flooding, earthquake, landslide, extreme heat, and more, compared against all U.S. census tracts

HOW IT WORKS
• Reads the property address from the browser URL bar — it does not scrape or alter the website
• Shows results in Chrome's native side panel, separate from the page
• Caches results locally for 30 days so repeat views load instantly
• Works only for California properties

DATA SOURCES
CAL FIRE, FEMA (NFHL, FC-FIRM, National Risk Index), Cal-Adapt / CMIP6 LOCA2, NOAA, and OpenStreetMap (geocoding). Climate projections are served through the developer's Climateshed CMIP6 service.

IMPORTANT — EDUCATIONAL USE ONLY
This is a proof of concept for educational purposes and should not be the sole basis for any real-estate decision. Climate projections are scenarios, not guarantees, and represent one emissions pathway (SSP3-7.0). Flood zones require official FEMA verification for insurance. Always consult qualified professionals and official hazard maps before purchasing property.

PRIVACY
The extension processes only the property address and its coordinates, solely to fetch public climate data. No personal data is collected, sold, or shared. Cached data stays on your device.
```

---

## Single purpose description (required)
```
Climate Risk - California displays educational climate-risk information for the California real-estate listing the user is currently viewing.
```

---

## Permission justifications
Provide one justification per item in the dashboard's "Privacy practices" tab.

| Permission | Justification |
|---|---|
| `storage` | Caches each property's climate-risk results locally for 30 days so repeat views load instantly and to minimize calls to public data APIs. No personal data is stored. |
| `sidePanel` | The extension's entire interface is a Chrome side panel that displays the climate-risk information; this permission is required to open and render it. |
| `activeTab` | Reads the URL of the property listing the user is actively viewing so the correct address can be looked up. |
| `tabs` | Detects when the active tab is a supported property listing (by URL pattern) to show the toolbar badge and refresh the side panel as the user navigates between listings. Only the tab URL is read — page content is never accessed. |
| `notifications` | Shows a single one-time notification after install prompting the user to pin the extension. No other notifications are sent. |

### Host permission justifications
| Host(s) | Justification |
|---|---|
| `*.zillow.com`, `*.realtor.com`, `*.redfin.com`, `*.trulia.com`, `*.compass.com`, `*.homes.com` | Reads the page URL on these supported real-estate sites to recognize property-listing pages and extract the property address from the URL. The extension does not read or modify page content. |
| `climateshed-cmip6-proxy.neil-matouka.workers.dev` | The developer's Cloudflare Worker proxy that returns CMIP6 climate projections, NOAA sea level rise, and the FEMA National Risk Index for the property's coordinates. |
| `api.cal-adapt.org` | Fetches Cal-Adapt / UC Merced mid-century wildfire occurrence probability for the property's coordinates. |
| `services.gis.ca.gov` | Fetches CAL FIRE Fire Hazard Severity Zone designations for the property's coordinates. |
| `hazards.fema.gov` | Fetches FEMA flood zone and future-conditions flood data for the property's coordinates. |
| `nominatim.openstreetmap.org` | Geocodes the property address into latitude/longitude so the data APIs above can be queried. |

---

## Data usage / Privacy practices (dashboard questionnaire)

**What user data does this item collect?**
- Personally identifiable information: **No**
- Health information: **No**
- Financial and payment information: **No**
- Authentication information: **No**
- Personal communications: **No**
- Location: **No** *(the extension handles the **listing's** location from the page URL, not the user's own location/GPS)*
- Web history: **No** *(reads only the current tab URL to detect a listing; does not collect or transmit browsing history)*
- User activity: **No**
- Website content: **No**

**Required certifications (check all):**
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Remote code:** No — the extension executes no remote code (`content_security_policy` is `script-src 'self'`). It only makes data (fetch) requests to the public APIs listed above.

**Privacy policy URL:** *(required — paste your existing privacy-policy URL)*

---

## Assets still needed (cannot be generated from code)
- **Icon:** 128×128 store icon — already in `icons/icon128.png`. ✔
- **Screenshots:** at least one 1280×800 (or 640×400) screenshot. The images in `docs/` predate the v1.6.0 UI (they lack the FEMA NRI section and CMIP6 ranges) — **capture fresh screenshots** of the side panel on a California listing before submitting.
- **Small promo tile (440×280):** optional but recommended.
