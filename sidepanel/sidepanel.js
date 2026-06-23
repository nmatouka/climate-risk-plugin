'use strict';

// Loaded before this script via <script> tags in sidepanel.html:
//   ../utils/cache.js       → exposes ClimateCache
//   ../utils/datafetcher.js → exposes ClimateDataFetcher

const DEBUG = false;

function debug(...args) {
  if (DEBUG) console.log('[ClimateRisk]', ...args);
}

// ─── Multi-Site URL Parsing ──────────────────────────────────────────────────
// Reads the property address from the browser URL bar.
// Supports: Zillow, Realtor.com, Redfin, Trulia, Compass, Homes.com

// Shared parser for Zillow-style slugs: scan backward for zip (5 digits)
// then state (2-letter code), convert hyphens to spaces for the address.
function parseSlug(slug) {
  const parts = slug.split('-');
  let state = null, zip = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/^\d{5}$/.test(part) && !zip)          { zip   = part; continue; }
    if (/^[A-Z]{2}$/i.test(part) && !state)    { state = part.toUpperCase(); break; }
  }
  return { address: slug.replace(/-/g, ' '), state, zip };
}

const SITES = [
  {
    // Zillow: /homedetails/123-Main-St-City-CA-94102/12345_zpid
    isProperty: (url) => /zillow\.com\/homedetails\/[^/]+\/\d+_zpid/.test(url),
    isOnSite:   (url) => url.includes('zillow.com'),
    parse(url) {
      const m = url.match(/\/homedetails\/([^/]+)\/\d+_zpid/);
      if (!m) return null;
      const { address, state, zip } = parseSlug(m[1]);
      return { address, state, zip, latitude: null, longitude: null };
    }
  },
  {
    // Realtor.com: /realestateandhomes-detail/123-Main-St_City_CA_94102_M12345
    isProperty: (url) => /realtor\.com\/realestateandhomes-detail\/[^/?#]+/.test(url),
    isOnSite:   (url) => url.includes('realtor.com'),
    parse(url) {
      const m = url.match(/\/realestateandhomes-detail\/([^/?#]+)/);
      if (!m) return null;
      const parts = m[1].split('_');
      if (parts.length < 4) return null;
      // Format: street_city_STATE_ZIP_Mid
      const zip    = parts[parts.length - 2];
      const state  = parts[parts.length - 3].toUpperCase();
      const city   = parts[parts.length - 4].replace(/-/g, ' ');
      const street = parts.slice(0, parts.length - 4).join(' ').replace(/-/g, ' ');
      return { address: `${street}, ${city}, ${state} ${zip}`, state, zip, latitude: null, longitude: null };
    }
  },
  {
    // Redfin: /CA/San-Francisco/123-Main-St-94102/home/12345678
    isProperty: (url) => /redfin\.com\/[A-Z]{2}\/[^/]+\/[^/]+\/home\/\d+/.test(url),
    isOnSite:   (url) => url.includes('redfin.com'),
    parse(url) {
      const m = url.match(/redfin\.com\/([A-Z]{2})\/([^/]+)\/([^/]+)\/home\/\d+/);
      if (!m) return null;
      const state = m[1];
      const city  = m[2].replace(/-/g, ' ');
      // Zip is the last 5-digit token in the street slug
      const slugParts = m[3].split('-');
      let zip = null, zipIdx = slugParts.length;
      for (let i = slugParts.length - 1; i >= 0; i--) {
        if (/^\d{5}$/.test(slugParts[i])) { zip = slugParts[i]; zipIdx = i; break; }
      }
      const street = slugParts.slice(0, zipIdx).join(' ');
      return { address: `${street}, ${city}, ${state}${zip ? ' ' + zip : ''}`, state, zip, latitude: null, longitude: null };
    }
  },
  {
    // Trulia /p/:       /p/ca/san-francisco/123-main-st-city-ca-94102--1234567890
    // Trulia /home/:    /home/811-w-grand-ave-oakland-ca-94607-24738456
    // Trulia /building/: /building/building-name-123-main-st-city-ny-10001-1234567890
    isProperty: (url) => /trulia\.com\/p\/[a-z]{2}\/[^/]+\/[^/?#]+--\d+/.test(url) ||
                         /trulia\.com\/home\/[^/?#]+-\d+/.test(url)                 ||
                         /trulia\.com\/building\/[^/?#]+/.test(url),
    isOnSite:   (url) => url.includes('trulia.com'),
    parse(url) {
      // /p/ format: /p/ca/city/address-slug--id
      let m = url.match(/trulia\.com\/p\/([a-z]{2})\/[^/]+\/([^/?#]+)/);
      if (m) {
        const slug = m[2].replace(/--\d+$/, ''); // strip trailing --id
        const { address, state, zip } = parseSlug(slug);
        return { address, state: state || m[1].toUpperCase(), zip, latitude: null, longitude: null };
      }
      // /home/ format: /home/address-slug-numericid (6+ digit id at end)
      m = url.match(/trulia\.com\/home\/([^/?#]+)/);
      if (m) {
        const slug = m[1].replace(/-\d{6,}$/, ''); // strip trailing numeric id
        const { address, state, zip } = parseSlug(slug);
        return { address, state, zip, latitude: null, longitude: null };
      }
      // /building/ format
      m = url.match(/trulia\.com\/building\/([^/?#]+)/);
      if (m) {
        const slug = m[1].replace(/-\d{7,}$/, ''); // strip trailing numeric id
        const { address, state, zip } = parseSlug(slug);
        return { address, state, zip, latitude: null, longitude: null };
      }
      return null;
    }
  },
  {
    // Compass: /homedetails/123-Main-St-City-NY-11215/12345_lid  (or _pid, _uid, etc.)
    isProperty: (url) => /compass\.com\/homedetails\/[^/]+\/[^/?#]+_\w+id/.test(url),
    isOnSite:   (url) => url.includes('compass.com'),
    parse(url) {
      const m = url.match(/compass\.com\/homedetails\/([^/]+)\/[^/?#]+_\w+id/);
      if (!m) return null;
      const { address, state, zip } = parseSlug(m[1]);
      return { address, state, zip, latitude: null, longitude: null };
    }
  },
  {
    // Homes.com: /property/123-main-st-city-ca/abc123def
    isProperty: (url) => /homes\.com\/property\/[^/]+\/[a-z0-9]+/.test(url),
    isOnSite:   (url) => url.includes('homes.com'),
    parse(url) {
      const m = url.match(/homes\.com\/property\/([^/]+)\/[^/]+/);
      if (!m) return null;
      const { address, state, zip } = parseSlug(m[1]);
      return { address, state, zip, latitude: null, longitude: null };
    }
  }
];

function isSupportedSite(url) {
  return url ? SITES.some(s => s.isOnSite(url)) : false;
}

function isPropertyUrl(url) {
  return url ? SITES.some(s => s.isProperty(url)) : false;
}

// On a supported site but not a property page (search results, homepage, etc.)
function isSearchUrl(url) {
  if (!url) return false;
  return SITES.some(s => s.isOnSite(url)) && !isPropertyUrl(url);
}

function parsePropertyUrl(url) {
  if (!url) return null;
  for (const site of SITES) {
    if (site.isProperty(url)) return site.parse(url);
  }
  return null;
}

// ─── Geocoding ──────────────────────────────────────────────────────────────

async function geocodeAddress(propertyData) {
  try {
    const query = encodeURIComponent(propertyData.address);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=us`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'ClimateRiskExtension/2.0' }
    });

    if (!response.ok) {
      throw new Error('Geocoding service unavailable');
    }

    const data = await response.json();

    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
    }

    // Fallback: geocode by city + state + zip if full address fails.
    // Returns a ZIP centroid — accuracy may be low for large rural ZIP codes.
    if (propertyData.zip && propertyData.state) {
      const fallbackQuery = encodeURIComponent(
        `${propertyData.zip}, ${propertyData.state}`
      );
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${fallbackQuery}&limit=1&countrycodes=us`;

      const fallbackResponse = await fetch(fallbackUrl, {
        headers: { 'User-Agent': 'ClimateRiskExtension/2.0' }
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData && fallbackData.length > 0) {
          return {
            latitude: parseFloat(fallbackData[0].lat),
            longitude: parseFloat(fallbackData[0].lon),
            isZipFallback: true
          };
        }
      }
    }

    return null;
  } catch (error) {
    debug('Geocoding error:', error.message);
    return null;
  }
}

// ─── State Machine ──────────────────────────────────────────────────────────

const STATE_IDS = [
  'state-not-supported',
  'state-search',
  'state-non-ca',
  'state-loading',
  'state-error',
  'state-results'
];

function showState(state, payload) {
  STATE_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });

  switch (state) {
    case 'NOT_SUPPORTED':
      document.getElementById('state-not-supported').hidden = false;
      break;

    case 'SEARCH':
      document.getElementById('state-search').hidden = false;
      break;

    case 'NON_CA':
      document.getElementById('state-non-ca').hidden = false;
      if (payload) {
        document.getElementById('non-ca-address').textContent = payload.address;
      }
      break;

    case 'LOADING':
      document.getElementById('state-loading').hidden = false;
      if (payload) {
        document.getElementById('loading-address').textContent = payload.address;
      }
      break;

    case 'ERROR':
      document.getElementById('state-error').hidden = false;
      document.getElementById('error-detail').textContent =
        typeof payload === 'string' ? payload : 'Please refresh and try again.';
      break;

    case 'RESULTS':
      document.getElementById('state-results').hidden = false;
      renderResults(payload.propertyData, payload.riskData);
      break;
  }
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

async function checkCurrentTab() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    showState('NOT_SUPPORTED', null);
    return;
  }

  const tab = tabs[0];
  if (!tab || !tab.url) {
    showState('NOT_SUPPORTED', null);
    return;
  }

  const url = tab.url;

  if (!isSupportedSite(url)) {
    showState('NOT_SUPPORTED', null);
    return;
  }

  if (isSearchUrl(url)) {
    showState('SEARCH', null);
    return;
  }

  if (!isPropertyUrl(url)) {
    showState('NOT_SUPPORTED', null);
    return;
  }

  const propertyData = parsePropertyUrl(url);
  if (!propertyData) {
    showState('ERROR', 'Could not parse property address from URL.');
    return;
  }

  if (propertyData.state && propertyData.state !== 'CA') {
    showState('NON_CA', propertyData);
    return;
  }

  await processProperty(propertyData);
}

async function processProperty(propertyData) {
  // Check cache first
  const cached = await ClimateCache.get(propertyData.address);
  if (cached) {
    showState('RESULTS', { propertyData, riskData: cached });
    return;
  }

  showState('LOADING', propertyData);

  const coords = await geocodeAddress(propertyData);
  if (!coords) {
    showState(
      'ERROR',
      'Could not find coordinates for this address. The address may be too new or the geocoding service may be temporarily unavailable.'
    );
    return;
  }

  propertyData.latitude = coords.latitude;
  propertyData.longitude = coords.longitude;
  propertyData.isZipFallback = coords.isZipFallback || false;

  let riskData;
  try {
    riskData = await ClimateDataFetcher.fetchAllRisks(propertyData);
  } catch (err) {
    showState('ERROR', 'Failed to fetch climate data. Please try again.');
    return;
  }

  await ClimateCache.set(propertyData.address, riskData);
  showState('RESULTS', { propertyData, riskData });
}

// ─── DOM Helpers ────────────────────────────────────────────────────────────

function createEl(tag, className, textContent) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent !== undefined && textContent !== null) el.textContent = textContent;
  return el;
}

function createExternalLink(href, text, className) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  if (className) a.className = className;
  return a;
}

function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ─── Risk Aggregation ───────────────────────────────────────────────────────

const LEVEL_NAMES  = ['minimal', 'low', 'moderate', 'high', 'severe'];
const LEVEL_LABELS = ['Minimal', 'Low', 'Moderate', 'High', 'Severe'];

// Returns the highest level (0–4) across available risk items, or null if none available.
function aggregateLevel(riskItems) {
  const levels = riskItems
    .filter(r => r && r.available)
    .map(r => r.level);
  return levels.length > 0 ? Math.max(...levels) : null;
}

// ─── Results Rendering ──────────────────────────────────────────────────────

function renderResults(propertyData, riskData) {
  // Address
  const addrEl = document.getElementById('property-address');
  clearEl(addrEl);
  addrEl.textContent = propertyData.address;

  // ZIP fallback warning — shown when full address geocoding failed
  const geocodeWarning = document.getElementById('geocode-warning');
  if (geocodeWarning) {
    if (propertyData.isZipFallback) {
      geocodeWarning.textContent = 'Note: exact address could not be geocoded — results are based on the ZIP code centroid and may not reflect the specific property location.';
      geocodeWarning.hidden = false;
    } else {
      geocodeWarning.hidden = true;
    }
  }

  // Aggregate levels — mirrors Climateshed's currentAggregateLevel / projectedAggregateLevel
  const currentLevel = aggregateLevel([riskData.wildfire, riskData.flood]);
  const projectedLevel = aggregateLevel([
    riskData.wildfireProjection, riskData.floodProjection,
    riskData.heat, riskData.extremeHeatDays,
    riskData.extremePrecipitation, riskData.seaLevelRise
  ]);

  // Now → 2050 summary row
  renderSummaryRow(document.getElementById('risk-summary-row'), currentLevel, projectedLevel);

  // Current Conditions section
  renderSectionHeader(
    document.getElementById('current-section-header'),
    'Current Conditions',
    'Based on current regulatory designations',
    currentLevel
  );
  renderRiskCards(document.getElementById('current-risk-container'), [
    {
      name: 'Wildfire', icon: '🔥', data: riskData.wildfire,
      source: 'CAL FIRE',
      url: 'https://osfm.fire.ca.gov/divisions/wildfire-planning-engineering/wildland-hazards-building-codes/fire-hazard-severity-zones-maps/'
    },
    {
      name: 'Flood', icon: '🌊', data: riskData.flood,
      source: 'FEMA NFHL',
      url: 'https://msc.fema.gov/portal/home'
    }
  ]);

  // Mid-Century Projections section
  renderSectionHeader(
    document.getElementById('projected-section-header'),
    'Mid-Century Projections',
    'LOCA2 CMIP6, 5-model ensemble, SSP3-7.0 (high-emissions), 2050–2059. Wildfire probability uses Cal-Adapt (UC Merced). Results from other models or scenarios may differ.',
    projectedLevel
  );
  renderRiskCards(document.getElementById('projected-risk-container'), [
    {
      name: 'Wildfire Probability', icon: '🔥', data: riskData.wildfireProjection,
      source: 'Cal-Adapt (UC Merced)',
      url: 'https://cal-adapt.org/'
    },
    {
      name: 'Projected Flood', icon: '🌊', data: riskData.floodProjection,
      source: 'FEMA FC-FIRM',
      url: 'https://msc.fema.gov/portal/home'
    },
    {
      name: 'Extreme Heat', icon: '☀️', data: riskData.heat,
      source: 'CMIP6 LOCA2 ensemble',
      url: 'https://cal-adapt.org/'
    },
    {
      name: 'Extreme Heat Days', icon: '🔆', data: riskData.extremeHeatDays,
      source: 'CMIP6 LOCA2 ensemble',
      url: 'https://cal-adapt.org/'
    },
    {
      name: 'Precipitation Change', icon: '🌧️', data: riskData.extremePrecipitation,
      source: 'CMIP6 LOCA2 ensemble',
      url: 'https://cal-adapt.org/'
    },
    {
      name: 'Sea Level Rise', icon: '📈', data: riskData.seaLevelRise,
      source: 'NOAA NOS / OPC 2024',
      url: 'https://oceanservice.noaa.gov/hazards/sealevelrise/'
    }
  ]);

  // Regional multi-hazard index (FEMA NRI) — present-day, its own section
  renderNRI(riskData.nri);

  // Disclaimer
  const disc = document.getElementById('disclaimer');
  clearEl(disc);
  disc.appendChild(createEl('strong', null, 'Disclaimer:'));
  disc.appendChild(document.createTextNode(
    ' This information is for educational purposes only. ' +
    'Climate risk data is sourced from Cal-Adapt, CAL FIRE, FEMA, and NOAA. ' +
    'Mid-century projections (2050–2060) shown for forward-looking risks. ' +
    'Consult with professionals and review official hazard maps before making real estate decisions.'
  ));
}

function renderSummaryRow(el, currentLevel, projectedLevel) {
  clearEl(el);
  if (currentLevel === null) return;

  el.appendChild(createEl('span', 'summary-label', 'Now:'));
  el.appendChild(createEl('span', `risk-level risk-level-${LEVEL_NAMES[currentLevel]}`, LEVEL_LABELS[currentLevel]));

  if (projectedLevel !== null) {
    el.appendChild(createEl('span', 'summary-arrow', '→'));
    el.appendChild(createEl('span', 'summary-label', '2050:'));
    el.appendChild(createEl('span', `risk-level risk-level-${LEVEL_NAMES[projectedLevel]}`, LEVEL_LABELS[projectedLevel]));

    if (projectedLevel > currentLevel) {
      el.appendChild(createEl('span', 'summary-trend summary-trend-up', '↑'));
    } else if (projectedLevel < currentLevel) {
      el.appendChild(createEl('span', 'summary-trend summary-trend-down', '↓'));
    }
  }
}

function renderSectionHeader(el, title, subtitle, level) {
  clearEl(el);
  const textDiv = createEl('div', 'section-header-text');
  textDiv.appendChild(createEl('div', 'section-title', title));
  textDiv.appendChild(createEl('div', 'section-subtitle', subtitle));
  el.appendChild(textDiv);

  if (level !== null) {
    el.appendChild(
      createEl('span', `risk-level risk-level-${LEVEL_NAMES[level]}`, LEVEL_LABELS[level])
    );
  }
}

function renderRiskCards(container, risks) {
  clearEl(container);

  risks.forEach(risk => {
    const item = createEl('div', 'climate-risk-item');
    const itemHeader = createEl('div', 'risk-item-header');

    itemHeader.appendChild(createEl('span', 'risk-icon', risk.icon));
    itemHeader.appendChild(createEl('span', 'risk-name', risk.name));

    if (risk.data && risk.data.available) {
      const levelClass = LEVEL_NAMES[risk.data.level] || 'unknown';
      itemHeader.appendChild(
        createEl('span', `risk-level risk-level-${levelClass}`, risk.data.description)
      );
      item.appendChild(itemHeader);
      if (risk.data.details) {
        item.appendChild(createEl('div', 'risk-details', risk.data.details));
      }
      item.appendChild(createExternalLink(risk.url, `Source: ${risk.source}`, 'risk-source'));
    } else {
      // Show unavailable badge; still show details if present (e.g. FC-FIRM "Not mapped" explanation)
      const label = (risk.data && risk.data.description) ? risk.data.description : 'Data unavailable';
      itemHeader.appendChild(createEl('span', 'risk-level risk-level-unknown', label));
      item.appendChild(itemHeader);
      if (risk.data && risk.data.details) {
        item.appendChild(createEl('div', 'risk-details', risk.data.details));
      }
    }

    container.appendChild(item);
  });
}

// ─── FEMA NRI Section ─────────────────────────────────────────────────────────
// Present-day multi-hazard index (its own section, not part of the Current →
// 2050 narrative). Renders an overall badge plus per-hazard percentile rows.

function renderNRI(nri) {
  const headerEl = document.getElementById('nri-section-header');
  const containerEl = document.getElementById('nri-container');
  clearEl(headerEl);
  clearEl(containerEl);

  const SUBTITLE = 'Present-day multi-hazard risk vs. all U.S. census tracts';

  if (!nri || !nri.available) {
    const textDiv = createEl('div', 'section-header-text');
    textDiv.appendChild(createEl('div', 'section-title', 'Regional Hazard Index (FEMA NRI)'));
    textDiv.appendChild(createEl('div', 'section-subtitle', SUBTITLE));
    headerEl.appendChild(textDiv);

    const item = createEl('div', 'climate-risk-item');
    const itemHeader = createEl('div', 'risk-item-header');
    itemHeader.appendChild(createEl('span', 'risk-icon', '📊'));
    itemHeader.appendChild(createEl('span', 'risk-name', 'FEMA National Risk Index'));
    itemHeader.appendChild(createEl('span', 'risk-level risk-level-unknown', (nri && nri.description) || 'Not available'));
    item.appendChild(itemHeader);
    if (nri && nri.details) item.appendChild(createEl('div', 'risk-details', nri.details));
    containerEl.appendChild(item);
    return;
  }

  renderSectionHeader(headerEl, 'Regional Hazard Index (FEMA NRI)', SUBTITLE, nri.level);

  if (nri.details) {
    containerEl.appendChild(createEl('div', 'nri-summary', nri.details));
  }

  nri.hazards.forEach(h => {
    const row = createEl('div', 'nri-hazard-row');
    row.appendChild(createEl('span', 'nri-hazard-name', h.name));
    if (h.pctile != null) {
      row.appendChild(createEl('span', 'nri-hazard-pctile', `${Math.round(h.pctile)}th pctile`));
    }
    row.appendChild(createEl('span', `risk-level risk-level-${LEVEL_NAMES[h.level]}`, h.rating));
    containerEl.appendChild(row);
  });

  const extras = [];
  if (nri.socialVulnerability) extras.push(`Social vulnerability: ${nri.socialVulnerability}`);
  if (nri.communityResilience) extras.push(`Community resilience: ${nri.communityResilience}`);
  if (extras.length) {
    containerEl.appendChild(createEl('div', 'nri-extras', extras.join(' · ')));
  }

  containerEl.appendChild(
    createExternalLink('https://hazards.fema.gov/nri/', 'Source: FEMA National Risk Index', 'risk-source')
  );
}

// ─── Tab Navigation Listeners ────────────────────────────────────────────────
// React to URL changes including SPA-style pushState navigation.

let pendingCheck = null;

function scheduleCheck() {
  if (pendingCheck) clearTimeout(pendingCheck);
  pendingCheck = setTimeout(checkCurrentTab, 300);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.url || changeInfo.status === 'complete') && tab.active) {
    scheduleCheck();
  }
});

chrome.tabs.onActivated.addListener(() => {
  scheduleCheck();
});

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('retry-btn').addEventListener('click', checkCurrentTab);
  checkCurrentTab();
});
