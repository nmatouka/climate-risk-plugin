(function() {
  'use strict';

  const CONFIG = {
    CHECK_INTERVAL: 3000,
    CACHE_DURATION: 30 * 24 * 60 * 60 * 1000,
  };

  let currentPropertyData = null;
  // PRIORITY 1 FIX: Changed from simple flag to promise-based locking
  let processingPromise = null;
  let hasShownSearchPageMessage = false;
  let floodDataLoadStartTime = null;

  function init() {
    console.log('🌡️ Climate Risk Extension: Initialized');
    setInterval(checkForPropertyData, CONFIG.CHECK_INTERVAL);
    setTimeout(checkForPropertyData, 2000);
  }

  function checkForPropertyData() {
    // PRIORITY 1 FIX: Don't check if already processing
    if (processingPromise) return;
    
    if (isSearchResultsPage() && !hasShownSearchPageMessage) {
      console.log('🌡️ On search results page - extension works on individual property pages');
      hasShownSearchPageMessage = true;
      return;
    }
    
    if (isSearchResultsPage()) {
      return;
    }
    
    const propertyData = extractPropertyData();
    
    if (propertyData && !isSameProperty(propertyData)) {
      console.log('🌡️ New property detected, processing...');
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
            if (!currentPropertyData || currentPropertyData.address !== `${data.address.streetAddress}, ${data.address.addressLocality}, ${data.address.addressRegion} ${data.address.postalCode}`) {
              console.log('🌡️ Found property via JSON-LD:', data.address);
              if (data.geo) {
                console.log('🌡️ Coordinates from Zillow:', data.geo);
              }
            }
            
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
      
      if (!currentPropertyData || currentPropertyData.address !== addressSlug.replace(/-/g, ' ')) {
        console.log('🌡️ Found property via URL:', addressSlug);
        console.log('🌡️ Parsed - State:', state, 'City:', city, 'ZIP:', zip);
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
        console.log('🌡️ Found property via header:', text);
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
      
      console.log('🌡️ Geocoding address:', addressQuery);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ClimateRiskExtension/1.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const coords = {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon)
        };
        console.log('🌡️ Successfully geocoded:', coords);
        return coords;
      }
      
      if (propertyData.city && propertyData.state && propertyData.zip) {
        const fallbackQuery = encodeURIComponent(`${propertyData.city}, ${propertyData.state} ${propertyData.zip}`);
        const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${fallbackQuery}&limit=1&countrycodes=us`;
        
        console.log('🌡️ Trying fallback geocoding with city/state/zip');
        
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'User-Agent': 'ClimateRiskExtension/1.0'
          }
        });
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          if (fallbackData && fallbackData.length > 0) {
            const coords = {
              latitude: parseFloat(fallbackData[0].lat),
              longitude: parseFloat(fallbackData[0].lon)
            };
            console.log('🌡️ Fallback geocoding succeeded:', coords);
            return coords;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('🌡️ Geocoding error:', error);
      return null;
    }
  }

  // PRIORITY 1 FIX: Replaced simple flag with promise-based locking
  async function processProperty(propertyData) {
    // Wait for any existing processing to complete
    if (processingPromise) {
      console.log('🌡️ Already processing another property, waiting...');
      await processingPromise;
    }
    
    // Start new processing
    processingPromise = processPropertyInternal(propertyData);
    
    try {
      await processingPromise;
    } finally {
      processingPromise = null;
    }
  }

  async function processPropertyInternal(propertyData) {
    // PRIORITY 1 FIX: Wrapped entire function in try-catch
    try {
      console.log('🌡️ Step 1: Processing property:', propertyData.address);
      console.log('🌡️ Step 2: State detected as:', propertyData.state);
      
      if (propertyData.state && propertyData.state !== 'CA') {
        console.log('🌡️ Not California (state=' + propertyData.state + '), skipping');
        return;
      }
      
      if (!propertyData.state) {
        console.log('🌡️ No state in data, checking address string...');
        const addressUpper = propertyData.address.toUpperCase();
        console.log('🌡️ Address contains CA?', addressUpper.includes(' CA '));
        
        if (!addressUpper.includes(' CA ') && !addressUpper.includes('CALIFORNIA')) {
          console.log('🌡️ Cannot confirm California location, skipping');
          return;
        }
        console.log('🌡️ Address confirmed as California');
      }
      
      console.log('🌡️ Step 3: Checking cache...');
      const cachedData = await ClimateCache.get(propertyData.address);
      
      let riskData;
      if (cachedData) {
        console.log('🌡️ Step 4: Using cached data:', cachedData);
        riskData = cachedData;
      } else {
        console.log('🌡️ Step 4: No cache, fetching climate data from APIs...');
        
        if (!propertyData.latitude || !propertyData.longitude) {
          console.log('🌡️ No coordinates found, attempting to geocode address...');
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const coords = await geocodeAddress(propertyData);
          if (coords) {
            propertyData.latitude = coords.latitude;
            propertyData.longitude = coords.longitude;
            console.log('🌡️ Geocoded to:', coords);
          } else {
            console.log('🌡️ Geocoding failed, will fetch data without coordinates');
          }
        }
        
        displayRiskBadgeWithFloodLoading(propertyData);
        
        floodDataLoadStartTime = Date.now();
        
        console.log('🌡️ Calling ClimateDataFetcher.fetchAllRisks...');
        riskData = await ClimateDataFetcher.fetchAllRisks(propertyData);
        console.log('🌡️ Step 5: Climate data received:', riskData);
        console.log('🌡️ Step 6: Caching data...');
        await ClimateCache.set(propertyData.address, riskData);
        console.log('🌡️ Step 7: Data cached successfully');
      }
      
      console.log('🌡️ Step 8: Calling displayRiskBadge...');
      displayRiskBadge(riskData);
      console.log('🌡️ Step 9: displayRiskBadge completed');
      
    } catch (error) {
      // PRIORITY 1 FIX: Better error handling
      console.error('🌡️ ❌ ERROR in processProperty:', error);
      console.error('🌡️ Error stack:', error.stack);
      
      // Display error badge to user
      displayErrorBadge();
    }
  }

  // PRIORITY 1 FIX: Added error badge display
  function displayErrorBadge() {
    const existingBadge = document.getElementById('climate-risk-badge');
    if (existingBadge) existingBadge.remove();
    
    const insertionPoint = findInsertionPoint();
    if (!insertionPoint.element) return;
    
    const badge = document.createElement('div');
    badge.id = 'climate-risk-badge';
    badge.className = 'climate-risk-badge climate-risk-moderate';
    
    badge.innerHTML = `
      <div class="climate-risk-header">
        <span class="climate-risk-icon">⚠️</span>
        <span class="climate-risk-title">Climate Risk: Temporarily Unavailable</span>
      </div>
      <p style="font-size: 14px; color: #666; margin: 8px 0;">
        Unable to load climate data at this time. Please refresh the page to try again.
      </p>
    `;
    
    insertElement(badge, insertionPoint);
  }

  function displayRiskBadgeWithFloodLoading(propertyData) {
    const existingBadge = document.getElementById('climate-risk-badge');
    if (existingBadge) existingBadge.remove();
    
    const insertionPoint = findInsertionPoint();
    if (!insertionPoint.element) {
      console.error('🌡️ Cannot find suitable insertion point for badge');
      return;
    }
    
    const badge = document.createElement('div');
    badge.id = 'climate-risk-badge';
    badge.className = 'climate-risk-badge climate-risk-moderate';
    
    badge.innerHTML = `
      <div class="climate-risk-header">
        <span class="climate-risk-icon">🌡️</span>
        <span class="climate-risk-title">Climate Risk: Loading...</span>
      </div>
      <div class="flood-loading">
        <span>Loading climate risk data (this may take 10-20 seconds on first visit)...</span>
      </div>
    `;
    
    insertElement(badge, insertionPoint);
  }

  function displayRiskBadge(riskData) {
    const existingBadge = document.getElementById('climate-risk-badge');
    if (existingBadge) existingBadge.remove();
    
    const insertionPoint = findInsertionPoint();
    if (!insertionPoint.element) {
      console.error('🌡️ Cannot find suitable insertion point for badge');
      return;
    }
    
    const overallRisk = calculateOverallRisk(riskData);
    
    const badge = document.createElement('div');
    badge.id = 'climate-risk-badge';
    badge.className = `climate-risk-badge climate-risk-${overallRisk.level}`;
    
    let floodLoadTimeMsg = '';
    if (floodDataLoadStartTime) {
      const loadTime = ((Date.now() - floodDataLoadStartTime) / 1000).toFixed(1);
      if (loadTime < 30) {
        floodLoadTimeMsg = `<div style="font-size: 11px; color: #666; margin-top: 4px;">Flood data loaded in ${loadTime}s</div>`;
      }
      floodDataLoadStartTime = null;
    }
    
    badge.innerHTML = `
      <div class="climate-risk-header">
        <span class="climate-risk-icon">🌡️</span>
        <span class="climate-risk-title">Climate Risk: ${overallRisk.label}</span>
      </div>
      ${floodLoadTimeMsg}
      <button class="climate-risk-toggle">View Details</button>
    `;
    
    const detailPanel = createDetailPanel(riskData);
    badge.appendChild(detailPanel);
    
    const toggleButton = badge.querySelector('.climate-risk-toggle');
    toggleButton.addEventListener('click', () => {
      detailPanel.classList.toggle('climate-risk-details-visible');
      toggleButton.textContent = detailPanel.classList.contains('climate-risk-details-visible') 
        ? 'Hide Details' 
        : 'View Details';
    });
    
    insertElement(badge, insertionPoint);
    console.log('🌡️ ✅ Badge inserted successfully!');
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
        console.log('🌡️ Found price element');
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
          console.log('🌡️ Found summary element');
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
          console.log('🌡️ Found main content');
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
      riskData.heat?.level || 0
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
    const panel = document.createElement('div');
    panel.className = 'climate-risk-details';
    
    const risks = [
      { name: 'Wildfire', icon: '🔥', data: riskData.wildfire, source: 'CAL FIRE',
        url: 'https://osfm.fire.ca.gov/divisions/wildfire-planning-engineering/wildland-hazards-building-codes/fire-hazard-severity-zones-maps/' },
      { name: 'Flood', icon: '🌊', data: riskData.flood, source: 'FEMA',
        url: 'https://msc.fema.gov/portal/home' },
      { name: 'Sea Level Rise', icon: '📈', data: riskData.seaLevelRise, source: 'CA Coastal Commission',
        url: 'https://www.coastal.ca.gov/climate/slr/' },
      { name: 'Extreme Heat', icon: '☀️', data: riskData.heat, source: 'Cal-Adapt',
        url: 'https://cal-adapt.org/' }
    ];
    
    let detailsHTML = '<div class="climate-risk-list">';
    
    risks.forEach(risk => {
      if (risk.data && risk.data.available) {
        const levelClass = ['minimal', 'low', 'moderate', 'high', 'severe'][risk.data.level] || 'unknown';
        detailsHTML += `
          <div class="climate-risk-item">
            <div class="risk-item-header">
              <span class="risk-icon">${risk.icon}</span>
              <span class="risk-name">${risk.name}</span>
              <span class="risk-level risk-level-${levelClass}">${risk.data.description}</span>
            </div>
            ${risk.data.details ? `<div class="risk-details">${risk.data.details}</div>` : ''}
            <a href="${risk.url}" target="_blank" class="risk-source">Source: ${risk.source}</a>
          </div>
        `;
      } else {
        detailsHTML += `
          <div class="climate-risk-item">
            <div class="risk-item-header">
              <span class="risk-icon">${risk.icon}</span>
              <span class="risk-name">${risk.name}</span>
              <span class="risk-level risk-level-unknown">Data unavailable</span>
            </div>
          </div>
        `;
      }
    });
    
    detailsHTML += '</div>';
    detailsHTML += `
      <div class="climate-risk-disclaimer">
        <strong>Disclaimer:</strong> This information is for educational purposes only. 
        Climate risk data is sourced from Cal-Adapt, CAL FIRE, FEMA, and California Coastal Commission. 
        Consult with professionals and review official hazard maps before making real estate decisions.
      </div>
    `;
    
    panel.innerHTML = detailsHTML;
    return panel;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();