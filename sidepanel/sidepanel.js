'use strict';

// Loaded before this script via <script> tags in sidepanel.html:
//   ../utils/cache.js       → exposes ClimateCache
//   ../utils/dataFetcher.js → exposes ClimateDataFetcher

const DEBUG = false;

function debug(...args) {
  if (DEBUG) console.log('[ClimateRisk]', ...args);
}

// ─── URL Parsing ────────────────────────────────────────────────────────────
// Reads the property address from the browser URL bar.
// Example URL: /homedetails/123-Main-St-San-Francisco-CA-94102/2089934829_zpid/
// The address slug encodes the full address with hyphens in place of spaces.

function parsePropertyUrl(url) {
  if (!url) return null;

  const match = url.match(/\/homedetails\/([^/]+)\/(\d+)_zpid/);
  if (!match) return null;

  const slug = match[1];
  const parts = slug.split('-');
  let state = null;
  let zip = null;

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/^\d{5}$/.test(part) && !zip) {
      zip = part;
      continue;
    }
    if (/^[A-Z]{2}$/i.test(part) && !state) {
      state = part.toUpperCase();
      break;
    }
  }

  return {
    address: slug.replace(/-/g, ' '),
    slug: slug,
    zpid: match[2],
    state: state,
    zip: zip,
    latitude: null,
    longitude: null
  };
}

function isPropertyUrl(url) {
  return url ? /zillow\.com\/homedetails\/[^/]+\/\d+_zpid/.test(url) : false;
}

function isSearchUrl(url) {
  if (!url || !url.includes('zillow.com')) return false;
  try {
    const u = new URL(url);
    return (
      u.pathname.includes('/homes/') ||
      u.pathname === '/ca/' ||
      u.searchParams.has('searchQueryState')
    );
  } catch (e) {
    return false;
  }
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

  if (!url.includes('zillow.com')) {
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
