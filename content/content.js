(function() {
  'use strict';

  const CONFIG = {
    CHECK_INTERVAL: 3000,
    CACHE_DURATION: 30 * 24 * 60 * 60 * 1000,
  };

  let currentPropertyData = null;
  let isProcessing = false;
  let hasShownSearchPageMessage = false;

  function init() {
    console.log('🌡️ Climate Risk Extension: Initialized');
    setInterval(checkForPropertyData, CONFIG.CHECK_INTERVAL);
    setTimeout(checkForPropertyData, 2000);
  }

  function checkForPropertyData() {
    if (isProcessing) return;
    
    // Check if we're on a search results page
    if (isSearchResultsPage() && !hasShownSearchPageMessage) {
      console.log('🌡️ On search results page - extension works on individual property pages');
      hasShownSearchPageMessage = true;
      return;
    }
    
    // Skip if on search results
    if (isSearchResultsPage()) {
      return;
    }
    
    const propertyData = extractPropertyData();
    
    if (propertyData && !isSameProperty(propertyData)) {
      console.log('🌡️ New property detected, processing...');
      currentPropertyData = propertyData;
      processProperty(propertyData);
    }
    // Remove the repeated logging - property is already being tracked
  }

  function isSearchResultsPage() {
    // Check if we're on a detail page first (these should NOT be search pages)
    if (window.location.pathname.includes('/homedetails/')) {
      return false;
    }
    
    // Check URL patterns for search pages
    if (window.location.pathname.includes('/homes/') || 
        window.location.pathname === '/ca/' ||
        window.location.search.includes('searchQueryState')) {
      return true;
    }
    
    // Check for multiple price elements (indicates search results)
    const priceElements = document.querySelectorAll('[class*="Price"]');
    if (priceElements.length > 5) {
      return true;
    }
    
    return false;
  }

  function extractPropertyData() {
    // Method 1: Try JSON-LD (most reliable for coordinates)
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    
    for (let script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        
        if (data['@type'] === 'SingleFamilyResidence' || 
            data['@type'] === 'Apartment' || 
            data['@type'] === 'House') {
          if (data.address) {
            // Only log on first discovery
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
    
    // Method 2: Try to extract from URL (for detail pages)
    const urlMatch = window.location.pathname.match(/\/homedetails\/(.+?)\/(\d+)_zpid/);
    if (urlMatch) {
      const addressSlug = urlMatch[1];
      const addressParts = addressSlug.split('-');
      
      // Find state by looking for 2-letter uppercase part that's not a number
      let state = null;
      let city = null;
      let zip = null;
      
      // Work backwards through address parts
      for (let i = addressParts.length - 1; i >= 0; i--) {
        const part = addressParts[i];
        
        // Check if it's a ZIP code (5 digits)
        if (/^\d{5}$/.test(part)) {
          zip = part;
          continue;
        }
        
        // Check if it's a state code (2 uppercase letters)
        if (/^[A-Z]{2}$/i.test(part) && !state) {
          state = part.toUpperCase();
          // City is usually the part before state
          if (i > 0) {
            city = addressParts[i - 1];
          }
          break;
        }
      }
      
      // Only log on first discovery
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
    
    // Method 3: Try to find address in page header
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
      // Build a more complete address string
      let addressQuery = propertyData.address;
      
      // If we have structured data, build a better query
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
      
      // If no results, try with just city, state, zip
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

  async function processProperty(propertyData) {
    isProcessing = true;
    
    try {
      console.log('🌡️ Step 1: Processing property:', propertyData.address);
      console.log('🌡️ Step 2: State detected as:', propertyData.state);
      
      // Check if California
      if (propertyData.state && propertyData.state !== 'CA') {
        console.log('🌡️ Not California (state=' + propertyData.state + '), skipping');
        isProcessing = false;
        return;
      }
      
      // If we don't have state info, check if CA is in the address
      if (!propertyData.state) {
        console.log('🌡️ No state in data, checking address string...');
        const addressUpper = propertyData.address.toUpperCase();
        console.log('🌡️ Address contains CA?', addressUpper.includes(' CA '));
        
        if (!addressUpper.includes(' CA ') && !addressUpper.includes('CALIFORNIA')) {
          console.log('🌡️ Cannot confirm California location, skipping');
          isProcessing = false;
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
        
        // If we don't have coordinates, try to geocode
        if (!propertyData.latitude || !propertyData.longitude) {
          console.log('🌡️ No coordinates found, attempting to geocode address...');
          
          // Add a small delay to respect rate limits
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
      console.error('🌡️ ❌ ERROR in processProperty:', error);
      console.error('🌡️ Error stack:', error.stack);
    } finally {
      isProcessing = false;
      console.log('🌡️ Step 10: Processing complete, isProcessing=false');
    }
  }

  function displayRiskBadge(riskData) {
    const existingBadge = document.getElementById('climate-risk-badge');
    if (existingBadge) existingBadge.remove();
    
    // Try multiple strategies to find insertion point
    let insertionPoint = null;
    let insertMethod = null;
    
    // Strategy 1: Find price element
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
      // Only use if there's exactly one (avoid search results)
      if (elements.length === 1) {
        insertionPoint = elements[0];
        insertMethod = 'afterPrice';
        console.log('🌡️ Found price element');
        break;
      }
    }
    
    // Strategy 2: Find summary/facts section
    if (!insertionPoint) {
      const summarySelectors = [
        '[data-test="home-details-summary"]',
        '.ds-home-details-chip-container',
        '[class*="summary"]',
        '.ds-overview-section'
      ];
      
      for (let selector of summarySelectors) {
        insertionPoint = document.querySelector(selector);
        if (insertionPoint) {
          insertMethod = 'afterSummary';
          console.log('🌡️ Found summary element');
          break;
        }
      }
    }
    
    // Strategy 3: Find main content area
    if (!insertionPoint) {
      const contentSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.ds-data-col',
        '#ds-container'
      ];
      
      for (let selector of contentSelectors) {
        insertionPoint = document.querySelector(selector);
        if (insertionPoint) {
          insertMethod = 'prepend';
          console.log('🌡️ Found main content');
          break;
        }
      }
    }
    
    if (!insertionPoint) {
      console.error('🌡️ Cannot find suitable insertion point for badge');
      return;
    }
    
    const badge = createBadgeElement(riskData);
    
    // Insert based on method
    if (insertMethod === 'afterPrice' || insertMethod === 'afterSummary') {
      insertionPoint.parentNode.insertBefore(badge, insertionPoint.nextSibling);
    } else if (insertMethod === 'prepend') {
      insertionPoint.insertBefore(badge, insertionPoint.firstChild);
    }
    
    console.log('🌡️ ✅ Badge inserted successfully!');
  }

  function createBadgeElement(riskData) {
    const overallRisk = calculateOverallRisk(riskData);
    
    const badge = document.createElement('div');
    badge.id = 'climate-risk-badge';
    badge.className = `climate-risk-badge climate-risk-${overallRisk.level}`;
    
    badge.innerHTML = `
      <div class="climate-risk-header">
        <span class="climate-risk-icon">🌡️</span>
        <span class="climate-risk-title">Climate Risk: ${overallRisk.label}</span>
      </div>
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
    
    return badge;
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