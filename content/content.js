(function() {
  'use strict';

  const CONFIG = {
    CHECK_INTERVAL: 3000,
    CACHE_DURATION: 30 * 24 * 60 * 60 * 1000,
    DEBUG: false,
  };

  function debug(...args) {
    if (CONFIG.DEBUG) {
      console.log(...args);
    }
  }

  let currentPropertyData = null;
  let processingPromise = null;
  let hasShownSearchPageMessage = false;
  let floodDataLoadStartTime = null;

  function init() {
    debug('Climate Risk Extension: Initialized');
    setInterval(checkForPropertyData, CONFIG.CHECK_INTERVAL);
    setTimeout(checkForPropertyData, 2000);
  }

  function checkForPropertyData() {
    if (processingPromise) return;

    if (isSearchResultsPage()) {
      if (!hasShownSearchPageMessage) {
        debug('On search results page - extension works on individual property pages');
        hasShownSearchPageMessage = true;
      }
      return;
    }

    const propertyData = extractPropertyData();

    if (propertyData && !isSameProperty(propertyData)) {
      debug('New property detected, processing...');
      currentPropertyData = propertyData;
      processProperty(propertyData);
    }
  }

  function isSearchResultsPage() {
    if (window.location.pathname.includes('/homedetails/')) {
      return false;
    }

    if (window.location.pathname.includes('/homes/') ||
        window.location.pathname === '/ca/' ||
        window.location.search.includes('searchQueryState')) {
      return true;
    }

    const priceElements = document.querySelectorAll('[class*="Price"]');
    if (priceElements.length > 5) {
      return true;
    }

    return false;
  }

  function extractPropertyData() {
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (let script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);

        if (data['@type'] === 'SingleFamilyResidence' ||
            data['@type'] === 'Apartment' ||
            data['@type'] === 'House') {
          if (data.address) {
            return {
              address: `${data.address.streetAddress}, ${data.address.addressLocality}, ${data.address.addressRegion} ${data.address.postalCode}`,
              latitude: data.geo?.latitude,
              longitude: data.geo?.longitude,
              streetAddress: data.address.streetAddress,
              city: data.address.addressLocality,
              state: data.address.addressRegion,
              zip: data.address.postalCode
            };
          }
        }
      } catch (e) {
        // Continue to next script
      }
    }

    const urlMatch = window.location.pathname.match(/\/homedetails\/(.+?)\/(\d+)_zpid/);
    if (urlMatch) {
      const addressSlug = urlMatch[1];
      const addressParts = addressSlug.split('-');

      let state = null;
      let city = null;
      let zip = null;

      for (let i = addressParts.length - 1; i >= 0; i--) {
        const part = addressParts[i];

        if (/^\d{5}$/.test(part)) {
          zip = part;
          continue;
        }

        if (/^[A-Z]{2}$/i.test(part) && !state) {
          state = part.toUpperCase();
          if (i > 0) {
            city = addressParts[i - 1];
          }
          break;
        }
      }

      return {
        address: addressSlug.replace(/-/g, ' '),
        latitude: null,
        longitude: null,
        state: state,
        city: city,
        zip: zip
      };
    }

    const addressSelectors = [
      'h1[data-test="address"]',
      'h1[class*="address"]',
      '[data-test="property-header-address"]',
      'header h1',
      '.ds-address-container h1'
    ];

    for (let selector of addressSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        const text = element.textContent.trim();
        const stateMatch = text.match(/\b([A-Z]{2})\s+\d{5}/);
        return {
          address: text,
          latitude: null,
          longitude: null,
          state: stateMatch ? stateMatch[1] : null
        };
      }
    }

    return null;
  }

  function isSameProperty(newData) {
    return currentPropertyData &&
           currentPropertyData.address === newData.address;
  }

  async function geocodeAddress(propertyData) {
    try {
      let addressQuery = propertyData.address;

      if (propertyData.streetAddress && propertyData.city && propertyData.state && propertyData.zip) {
        addressQuery = `${propertyData.streetAddress}, ${propertyData.city}, ${propertyData.state} ${propertyData.zip}`;
      }

      const query = encodeURIComponent(addressQuery);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=us`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ClimateRiskExtension/2.0'
        }
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

      if (propertyData.city && propertyData.state && propertyData.zip) {
        const fallbackQuery = encodeURIComponent(`${propertyData.city}, ${propertyData.state} ${propertyData.zip}`);
        const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${fallbackQuery}&limit=1&countrycodes=us`;

        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'User-Agent': 'ClimateRiskExtension/2.0'
          }
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

  async function processProperty(propertyData) {
    if (processingPromise) {
      await processingPromise;
    }

    processingPromise = processPropertyInternal(propertyData);

    try {
      await processingPromise;
    } finally {
      processingPromise = null;
    }
  }

  async function processPropertyInternal(propertyData) {
    try {
      if (propertyData.state && propertyData.state !== 'CA') {
        return;
      }

      if (!propertyData.state) {
        const addressUpper = propertyData.address.toUpperCase();
        if (!addressUpper.includes(' CA ') && !addressUpper.includes('CALIFORNIA')) {
          return;
        }
      }

      const cachedData = await ClimateCache.get(propertyData.address);

      let riskData;
      if (cachedData) {
        riskData = cachedData;
      } else {
        if (!propertyData.latitude || !propertyData.longitude) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const coords = await geocodeAddress(propertyData);
          if (coords) {
            propertyData.latitude = coords.latitude;
            propertyData.longitude = coords.longitude;
          }
        }

        displayRiskBadgeWithFloodLoading();

        floodDataLoadStartTime = Date.now();

        riskData = await ClimateDataFetcher.fetchAllRisks(propertyData);
        await ClimateCache.set(propertyData.address, riskData);
      }

      displayRiskBadge(riskData);

    } catch (error) {
      debug('Error in processProperty:', error.message);
      displayErrorBadge();
    }
  }

  // --- Safe DOM helper functions (no innerHTML) ---

  function createEl(tag, className, textContent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
  }

  function createHeader(icon, title) {
    const header = createEl('div', 'climate-risk-header');
    header.appendChild(createEl('span', 'climate-risk-icon', icon));
    header.appendChild(createEl('span', 'climate-risk-title', title));
    return header;
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

  function displayErrorBadge() {
    const existingBadge = document.getElementById('climate-risk-badge');
    if (existingBadge) existingBadge.remove();

    const insertionPoint = findInsertionPoint();
    if (!insertionPoint.element) return;

    const badge = createEl('div');
    badge.id = 'climate-risk-badge';
    badge.className = 'climate-risk-badge climate-risk-moderate';

    badge.appendChild(createHeader('\u26A0\uFE0F', 'Climate Risk: Temporarily Unavailable'));

    const msg = createEl('p', null, 'Unable to load climate data at this time. Please refresh the page to try again.');
    msg.style.cssText = 'font-size: 14px; color: #666; margin: 8px 0;';
    badge.appendChild(msg);

    insertElement(badge, insertionPoint);
  }

  function displayRiskBadgeWithFloodLoading() {
    const existingBadge = document.getElementById('climate-risk-badge');
    if (existingBadge) existingBadge.remove();

    const insertionPoint = findInsertionPoint();
    if (!insertionPoint.element) return;

    const badge = createEl('div');
    badge.id = 'climate-risk-badge';
    badge.className = 'climate-risk-badge climate-risk-moderate';

    badge.appendChild(createHeader('\uD83C\uDF21\uFE0F', 'Climate Risk: Loading...'));

    const loadingDiv = createEl('div', 'flood-loading');
    loadingDiv.appendChild(createEl('span', null, 'Loading climate risk data (including extreme precipitation and heat projections)...'));
    badge.appendChild(loadingDiv);

    insertElement(badge, insertionPoint);
  }

  function displayRiskBadge(riskData) {
    const existingBadge = document.getElementById('climate-risk-badge');
    if (existingBadge) existingBadge.remove();

    const insertionPoint = findInsertionPoint();
    if (!insertionPoint.element) return;

    const overallRisk = calculateOverallRisk(riskData);

    const badge = createEl('div');
    badge.id = 'climate-risk-badge';
    badge.className = `climate-risk-badge climate-risk-${overallRisk.level}`;

    badge.appendChild(createHeader('\uD83C\uDF21\uFE0F', `Climate Risk: ${overallRisk.label}`));

    if (floodDataLoadStartTime) {
      const loadTime = ((Date.now() - floodDataLoadStartTime) / 1000).toFixed(1);
      if (loadTime < 30) {
        const timeMsg = createEl('div', null, `Climate data loaded in ${loadTime}s`);
        timeMsg.style.cssText = 'font-size: 11px; color: #666; margin-top: 4px;';
        badge.appendChild(timeMsg);
      }
      floodDataLoadStartTime = null;
    }

    const toggleButton = createEl('button', 'climate-risk-toggle', 'View Details');
    badge.appendChild(toggleButton);

    const detailPanel = createDetailPanel(riskData);
    badge.appendChild(detailPanel);

    toggleButton.addEventListener('click', () => {
      detailPanel.classList.toggle('climate-risk-details-visible');
      toggleButton.textContent = detailPanel.classList.contains('climate-risk-details-visible')
        ? 'Hide Details'
        : 'View Details';
    });

    insertElement(badge, insertionPoint);
  }

  function findInsertionPoint() {
    let element = null;
    let method = null;

    const priceSelectors = [
      '[data-test="price"]',
      '[data-testid="price"]',
      '.ds-home-details-chip',
      '[class*="Text-c11n"][class*="price"]',
      'span[data-test="price"]',
      'div[data-test="price"]'
    ];

    for (let selector of priceSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length === 1) {
        element = elements[0];
        method = 'afterPrice';
        break;
      }
    }

    if (!element) {
      const summarySelectors = [
        '[data-test="home-details-summary"]',
        '.ds-home-details-chip-container',
        '[class*="summary"]',
        '.ds-overview-section'
      ];

      for (let selector of summarySelectors) {
        element = document.querySelector(selector);
        if (element) {
          method = 'afterSummary';
          break;
        }
      }
    }

    if (!element) {
      const contentSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.ds-data-col',
        '#ds-container'
      ];

      for (let selector of contentSelectors) {
        element = document.querySelector(selector);
        if (element) {
          method = 'prepend';
          break;
        }
      }
    }

    return { element, method };
  }

  function insertElement(badge, insertionPoint) {
    const { element, method } = insertionPoint;

    if (method === 'afterPrice' || method === 'afterSummary') {
      element.parentNode.insertBefore(badge, element.nextSibling);
    } else if (method === 'prepend') {
      element.insertBefore(badge, element.firstChild);
    }
  }

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

  function createDetailPanel(riskData) {
    const panel = createEl('div', 'climate-risk-details');

    const risks = [
      { name: 'Wildfire', icon: '\uD83D\uDD25', data: riskData.wildfire, source: 'CAL FIRE',
        url: 'https://osfm.fire.ca.gov/divisions/wildfire-planning-engineering/wildland-hazards-building-codes/fire-hazard-severity-zones-maps/' },
      { name: 'Flood', icon: '\uD83C\uDF0A', data: riskData.flood, source: 'FEMA',
        url: 'https://msc.fema.gov/portal/home' },
      { name: 'Extreme Heat', icon: '\u2600\uFE0F', data: riskData.heat, source: 'Cal-Adapt',
        url: 'https://cal-adapt.org/' },
      { name: 'Extreme Heat Days', icon: '\uD83D\uDD25', data: riskData.extremeHeatDays, source: 'Cal-Adapt',
        url: 'https://cal-adapt.org/' },
      { name: 'Extreme Precipitation', icon: '\uD83C\uDF27\uFE0F', data: riskData.extremePrecipitation, source: 'Cal-Adapt',
        url: 'https://cal-adapt.org/' },
      { name: 'Sea Level Rise', icon: '\uD83D\uDCC8', data: riskData.seaLevelRise, source: 'CA Coastal Commission',
        url: 'https://www.coastal.ca.gov/climate/slr/' }
    ];

    const list = createEl('div', 'climate-risk-list');

    risks.forEach(risk => {
      const item = createEl('div', 'climate-risk-item');
      const header = createEl('div', 'risk-item-header');

      header.appendChild(createEl('span', 'risk-icon', risk.icon));
      header.appendChild(createEl('span', 'risk-name', risk.name));

      if (risk.data && risk.data.available) {
        const levelClass = ['minimal', 'low', 'moderate', 'high', 'severe'][risk.data.level] || 'unknown';
        header.appendChild(createEl('span', `risk-level risk-level-${levelClass}`, risk.data.description));
        item.appendChild(header);

        if (risk.data.details) {
          item.appendChild(createEl('div', 'risk-details', risk.data.details));
        }

        item.appendChild(createExternalLink(risk.url, `Source: ${risk.source}`, 'risk-source'));
      } else {
        header.appendChild(createEl('span', 'risk-level risk-level-unknown', 'Data unavailable'));
        item.appendChild(header);
      }

      list.appendChild(item);
    });

    panel.appendChild(list);

    const disclaimer = createEl('div', 'climate-risk-disclaimer');
    const strong = createEl('strong', null, 'Disclaimer:');
    disclaimer.appendChild(strong);
    disclaimer.appendChild(document.createTextNode(
      ' This information is for educational purposes only. ' +
      'Climate risk data is sourced from Cal-Adapt, CAL FIRE, FEMA, and California Coastal Commission. ' +
      'Mid-century projections (2050-2060) shown for forward-looking risks. ' +
      'Consult with professionals and review official hazard maps before making real estate decisions.'
    ));
    panel.appendChild(disclaimer);

    return panel;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
