'use strict';

// Loaded before this script via <script> tags in sidepanel.html:
//   ../utils/cache.js       → exposes ClimateCache
//   ../utils/dataFetcher.js → exposes ClimateDataFetcher

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
    // Trulia /p/: /p/ca/san-francisco/123-main-st-city-ca-94102--1234567890
    // Trulia /building/: /building/building-name-123-main-st-city-ny-10001-1234567890
    isProperty: (url) => /trulia\.com\/p\/[a-z]{2}\/[^/]+\/[^/?#]+--\d+/.test(url) ||
                         /trulia\.com\/building\/[^/?#]+/.test(url),
    isOnSite:   (url) => url.includes('trulia.com'),
    parse(url) {
      let m = url.match(/trulia\.com\/p\/([a-z]{2})\/[^/]+\/([^/?#]+)/);
      if (m) {
        const slug = m[2].replace(/--\d+$/, ''); // strip trailing --id
        const { address, state, zip } = parseSlug(slug);
        return { address, state: state || m[1].toUpperCase(), zip, latitude: null, longitude: null };
      }
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
    // Compass: /homedetails/123-Main-St-City-NY-11215/12345_lid
    isProperty: (url) => /compass\.com\/homedetails\/[^/]+\/[^/]+_lid/.test(url),
    isOnSite:   (url) => url.includes('compass.com'),
    parse(url) {
      const m = url.match(/compass\.com\/homedetails\/([^/]+)\/[^/]+_lid/);
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

    // Fallback: geocode by city + state + zip if full address fails
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
            longitude: parseFloat(fallbackData[0].lon)
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

// ─── Risk Calculation ───────────────────────────────────────────────────────

function calculateOverallRisk(riskData) {
  const risks = [
    riskData.wildfire?.level || 0,
    riskData.flood?.level || 0,
    riskData.seaLevelRise?.level || 0,
    riskData.heat?.level || 0,
    riskData.extremePrecipitation?.level || 0,
    riskData.extremeHeatDays?.level || 0
  ];

  const maxRisk = Math.max(...risks);
  const labels = ['Minimal', 'Low', 'Moderate', 'High', 'Severe'];
  const levels = ['minimal', 'low', 'moderate', 'high', 'severe'];

  return {
    level: levels[maxRisk] || 'minimal',
    label: labels[maxRisk] || 'Minimal'
  };
}

// ─── Results Rendering ──────────────────────────────────────────────────────

function renderResults(propertyData, riskData) {
  // Address
  const addrEl = document.getElementById('property-address');
  clearEl(addrEl);
  addrEl.textContent = propertyData.address;

  // Overall risk header
  const overallRisk = calculateOverallRisk(riskData);
  const headerEl = document.getElementById('overall-risk-header');
  clearEl(headerEl);
  headerEl.className = `climate-risk-header climate-risk-${overallRisk.level}`;
  headerEl.appendChild(createEl('span', 'climate-risk-icon', '🌡️'));
  headerEl.appendChild(
    createEl('span', 'climate-risk-title', `Climate Risk: ${overallRisk.label}`)
  );

  // Risk items
  const risks = [
    {
      name: 'Wildfire', icon: '🔥', data: riskData.wildfire,
      source: 'CAL FIRE',
      url: 'https://osfm.fire.ca.gov/divisions/wildfire-planning-engineering/wildland-hazards-building-codes/fire-hazard-severity-zones-maps/'
    },
    {
      name: 'Flood', icon: '🌊', data: riskData.flood,
      source: 'FEMA',
      url: 'https://msc.fema.gov/portal/home'
    },
    {
      name: 'Extreme Heat', icon: '☀️', data: riskData.heat,
      source: 'Cal-Adapt',
      url: 'https://cal-adapt.org/'
    },
    {
      name: 'Extreme Heat Days', icon: '🔆', data: riskData.extremeHeatDays,
      source: 'Cal-Adapt',
      url: 'https://cal-adapt.org/'
    },
    {
      name: 'Extreme Precipitation', icon: '🌧️', data: riskData.extremePrecipitation,
      source: 'Cal-Adapt',
      url: 'https://cal-adapt.org/'
    },
    {
      name: 'Sea Level Rise', icon: '📈', data: riskData.seaLevelRise,
      source: 'CA Coastal Commission',
      url: 'https://www.coastal.ca.gov/climate/slr/'
    }
  ];

  const container = document.getElementById('risk-container');
  clearEl(container);

  const levelNames = ['minimal', 'low', 'moderate', 'high', 'severe'];

  risks.forEach(risk => {
    const item = createEl('div', 'climate-risk-item');
    const itemHeader = createEl('div', 'risk-item-header');

    itemHeader.appendChild(createEl('span', 'risk-icon', risk.icon));
    itemHeader.appendChild(createEl('span', 'risk-name', risk.name));

    if (risk.data && risk.data.available) {
      const levelClass = levelNames[risk.data.level] || 'unknown';
      itemHeader.appendChild(
        createEl('span', `risk-level risk-level-${levelClass}`, risk.data.description)
      );
      item.appendChild(itemHeader);

      if (risk.data.details) {
        item.appendChild(createEl('div', 'risk-details', risk.data.details));
      }

      item.appendChild(createExternalLink(risk.url, `Source: ${risk.source}`, 'risk-source'));
    } else {
      itemHeader.appendChild(
        createEl('span', 'risk-level risk-level-unknown', 'Data unavailable')
      );
      item.appendChild(itemHeader);
    }

    container.appendChild(item);
  });

  // Disclaimer
  const disc = document.getElementById('disclaimer');
  clearEl(disc);
  disc.appendChild(createEl('strong', null, 'Disclaimer:'));
  disc.appendChild(document.createTextNode(
    ' This information is for educational purposes only. ' +
    'Climate risk data is sourced from Cal-Adapt, CAL FIRE, FEMA, and California Coastal Commission. ' +
    'Mid-century projections (2050–2060) shown for forward-looking risks. ' +
    'Consult with professionals and review official hazard maps before making real estate decisions.'
  ));
}

// ─── Tab Navigation Listeners ────────────────────────────────────────────────
// React to URL changes including SPA-style pushState navigation.

let pendingCheck = null;

function scheduleCheck() {
  if (pendingCheck) clearTimeout(pendingCheck);
  pendingCheck = setTimeout(checkCurrentTab, 300);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    scheduleCheck();
  }
});

chrome.tabs.onActivated.addListener(() => {
  scheduleCheck();
});

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  checkCurrentTab();
});
