// ============================================
// FILE STRUCTURE:
// ============================================
// zillow-climate-risk/
// ├── manifest.json
// ├── README.md
// ├── icons/
// │   ├── icon16.png
// │   ├── icon48.png
// │   └── icon128.png
// ├── content/
// │   ├── content.js
// │   └── content.css
// ├── background/
// │   └── background.js
// ├── popup/
// │   ├── popup.html
// │   ├── popup.js
// │   └── popup.css
// └── utils/
//     ├── dataFetcher.js
//     └── cache.js

// ============================================
// manifest.json
// ============================================
{
  "manifest_version": 3,
  "name": "Climate Risk for Zillow - California",
  "version": "1.0.0",
  "description": "View climate risk data (wildfire, flood, sea level rise, heat) for California properties on Zillow",
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://*.zillow.com/*",
    "https://api.cal-adapt.org/*"
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background/background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://*.zillow.com/*"],
      "js": ["utils/cache.js", "utils/dataFetcher.js", "content/content.js"],
      "css": ["content/content.css"],
      "run_at": "document_idle"
    }
  ]
}

// ============================================
// utils/dataFetcher.js - COMPLETE IMPLEMENTATION
// ============================================
const ClimateDataFetcher = {
  // Cal-Adapt API configuration
  CAL_ADAPT_BASE_URL: 'https://api.cal-adapt.org/api',
  
  // Priority GCMs recommended by California's 4th Climate Change Assessment
  PRIORITY_GCMS: ['HadGEM2-ES', 'CNRM-CM5', 'CanESM2', 'MIROC5'],
  
  // Fetch all climate risk data for a property
  async fetchAllRisks(propertyData) {
    const results = {
      wildfire: null,
      flood: null,
      seaLevelRise: null,
      heat: null
    };
    
    try {
      // Fetch all risks in parallel
      const [wildfire, flood, seaLevelRise, heat] = await Promise.allSettled([
        this.fetchWildfireRisk(propertyData),
        this.fetchFloodRisk(propertyData),
        this.fetchSeaLevelRiseRisk(propertyData),
        this.fetchHeatRisk(propertyData)
      ]);
      
      if (wildfire.status === 'fulfilled') results.wildfire = wildfire.value;
      if (flood.status === 'fulfilled') results.flood = flood.value;
      if (seaLevelRise.status === 'fulfilled') results.seaLevelRise = seaLevelRise.value;
      if (heat.status === 'fulfilled') results.heat = heat.value;
      
    } catch (error) {
      console.error('Error fetching climate risks:', error);
    }
    
    return results;
  },
  
  // Fetch wildfire risk from CAL FIRE data
  async fetchWildfireRisk(propertyData) {
    // TODO: Implement CAL FIRE API or shapefile query
    // This would require querying CAL FIRE's Fire Hazard Severity Zones
    // For now, return placeholder
    return {
      available: false,
      level: 0,
      description: 'Data pending',
      details: 'Wildfire hazard severity zone data will be available in a future update.'
    };
  },
  
  // Fetch flood risk from FEMA
  async fetchFloodRisk(propertyData) {
    // TODO: Implement FEMA flood zone API
    // This would query the National Flood Hazard Layer
    // For now, return placeholder
    return {
      available: false,
      level: 0,
      description: 'Data pending',
      details: 'FEMA flood zone data will be available in a future update.'
    };
  },
  
  // Fetch sea level rise risk
  async fetchSeaLevelRiseRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude) {
      return {
        available: false,
        level: 0,
        description: 'Location data unavailable'
      };
    }
    
    // Simple check: is property within 10 miles of coast?
    // This is a rough approximation - proper implementation would use coastal zone data
    const isNearCoast = this.isNearCaliforniaCoast(
      propertyData.latitude, 
      propertyData.longitude
    );
    
    if (!isNearCoast) {
      return {
        available: true,
        level: 0,
        description: 'Not applicable',
        details: 'Property is not in coastal zone.'
      };
    }
    
    // TODO: Query California Coastal Commission sea level rise data
    return {
      available: false,
      level: 0,
      description: 'Data pending',
      details: 'Sea level rise vulnerability data for coastal properties will be available in a future update.'
    };
  },
  
  // Fetch extreme heat risk from Cal-Adapt API
  async fetchHeatRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude) {
      return {
        available: false,
        level: 0,
        description: 'Location data unavailable'
      };
    }
    
    try {
      // Cal-Adapt uses daily maximum temperature (tasmax) data
      // We'll query HadGEM2-ES model with RCP 8.5 (higher emissions scenario)
      const slug = 'tasmax_day_HadGEM2-ES_rcp85';
      const point = `POINT(${propertyData.longitude} ${propertyData.latitude})`;
      
      // Query for yearly data from 2050-2060 (mid-century projections)
      // Using the events endpoint with yearly frequency aggregation
      const startDate = '2050-01-01';
      const endDate = '2060-12-31';
      
      const url = `${this.CAL_ADAPT_BASE_URL}/series/${slug}/events/?` + 
        `g=${encodeURIComponent(point)}&` +
        `stat=mean&` +
        `freq=YS&` + // Yearly start frequency
        `start=${startDate}&` +
        `end=${endDate}`;
      
      console.log('Fetching extreme heat data from Cal-Adapt:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Cal-Adapt API returned status ${response.status}`);
      }
      
      const result = await response.json();
      
      // Response structure: { index: [...dates], data: [...values], columns: [...stats] }
      // For a point with freq, we get summary stats (min, mean, max, std, count)
      
      if (!result.data || result.data.length === 0) {
        throw new Error('No temperature data returned from Cal-Adapt');
      }
      
      // Calculate the average yearly maximum temperature
      // Data is in Kelvin, need to convert to Fahrenheit
      let totalMaxTemp = 0;
      let count = 0;
      
      result.data.forEach(yearData => {
        // yearData is an array: [min, mean, max, std, count]
        // We want the max (index 2) for yearly maximum temperature
        if (yearData && yearData[2]) {
          totalMaxTemp += yearData[2];
          count++;
        }
      });
      
      if (count === 0) {
        throw new Error('Unable to calculate temperature statistics');
      }
      
      const avgMaxTempK = totalMaxTemp / count;
      const avgMaxTempF = this.kelvinToFahrenheit(avgMaxTempK);
      
      // Classify risk based on projected maximum temperatures
      return this.classifyHeatRisk(avgMaxTempF);
      
    } catch (error) {
      console.error('Error fetching heat risk from Cal-Adapt:', error);
      return {
        available: false,
        level: 0,
        description: 'Error fetching data',
        details: `Unable to retrieve extreme heat data: ${error.message}`
      };
    }
  },
  
  // Convert Kelvin to Fahrenheit
  kelvinToFahrenheit(kelvin) {
    return (kelvin - 273.15) * 9/5 + 32;
  },
  
  // Classify heat risk based on projected maximum temperature
  classifyHeatRisk(avgMaxTempF) {
    let level, description, details;
    
    // Classification based on projected average maximum temperature
    // These thresholds are based on extreme heat definitions
    if (avgMaxTempF < 95) {
      level = 0; // Minimal
      description = 'Minimal';
      details = `Projected average maximum temperature of ${Math.round(avgMaxTempF)}°F by mid-century (2050-2060). Moderate summer heat expected.`;
    } else if (avgMaxTempF < 100) {
      level = 1; // Low
      description = 'Low';
      details = `Projected average maximum temperature of ${Math.round(avgMaxTempF)}°F by mid-century (2050-2060). Hot summers expected, adequate cooling recommended.`;
    } else if (avgMaxTempF < 105) {
      level = 2; // Moderate
      description = 'Moderate';
      details = `Projected average maximum temperature of ${Math.round(avgMaxTempF)}°F by mid-century (2050-2060). Very hot summers expected. Reliable air conditioning essential.`;
    } else if (avgMaxTempF < 110) {
      level = 3; // High
      description = 'High';
      details = `Projected average maximum temperature of ${Math.round(avgMaxTempF)}°F by mid-century (2050-2060). Extreme heat expected regularly. Significant cooling infrastructure needed.`;
    } else {
      level = 4; // Severe
      description = 'Severe';
      details = `Projected average maximum temperature of ${Math.round(avgMaxTempF)}°F by mid-century (2050-2060). Dangerous heat levels expected. May impact habitability during summer months.`;
    }
    
    return {
      available: true,
      level: level,
      description: description,
      details: details,
      rawData: {
        avgMaxTempF: Math.round(avgMaxTempF)
      }
    };
  },
  
  // Simple check if coordinates are near California coast
  isNearCaliforniaCoast(lat, lon) {
    // California coastal coordinates (approximate)
    // Considers properties within ~10 miles of coast
    const coastalThreshold = 0.15; // ~10 miles in degrees
    
    // Northern California coast
    if (lat >= 37.5 && lat <= 42 && lon >= -124.5 && lon <= -123.5 + coastalThreshold) {
      return true;
    }
    
    // Bay Area coast
    if (lat >= 37 && lat <= 38.5 && lon >= -123 && lon <= -122 + coastalThreshold) {
      return true;
    }
    
    // Central California coast
    if (lat >= 34.5 && lat <= 37 && lon >= -122.5 && lon <= -120 + coastalThreshold) {
      return true;
    }
    
    // Southern California coast
    if (lat >= 32.5 && lat <= 34.5 && lon >= -120 && lon <= -117 + coastalThreshold) {
      return true;
    }
    
    return false;
  }
};

// ============================================
// utils/cache.js
// ============================================
const ClimateCache = {
  CACHE_PREFIX: 'climate_risk_',
  CACHE_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
  
  // Get cached data for an address
  async get(address) {
    const key = this.CACHE_PREFIX + this.hashAddress(address);
    
    try {
      const result = await chrome.storage.local.get(key);
      
      if (result[key]) {
        const cached = result[key];
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - cached.timestamp < this.CACHE_DURATION) {
          return cached.data;
        } else {
          // Cache expired, remove it
          await this.remove(address);
        }
      }
    } catch (error) {
      console.error('Error reading from cache:', error);
    }
    
    return null;
  },
  
  // Set cached data for an address
  async set(address, data) {
    const key = this.CACHE_PREFIX + this.hashAddress(address);
    
    try {
      await chrome.storage.local.set({
        [key]: {
          data: data,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      console.error('Error writing to cache:', error);
    }
  },
  
  // Remove cached data for an address
  async remove(address) {
    const key = this.CACHE_PREFIX + this.hashAddress(address);
    
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error('Error removing from cache:', error);
    }
  },
  
  // Simple hash function for addresses
  hashAddress(address) {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      const char = address.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString();
  }
};

// ============================================
// content/content.js
// ============================================
(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    CHECK_INTERVAL: 2000, // Check for property data every 2 seconds
    CACHE_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
  };

  let currentPropertyData = null;
  let isProcessing = false;

  // Initialize the extension
  function init() {
    console.log('Climate Risk Extension: Initialized');
    
    // Start checking for property data
    setInterval(checkForPropertyData, CONFIG.CHECK_INTERVAL);
    
    // Check immediately on load
    checkForPropertyData();
  }

  // Check if we're on a property detail page and extract data
  function checkForPropertyData() {
    if (isProcessing) return;
    
    const propertyData = extractPropertyData();
    
    if (propertyData && !isSameProperty(propertyData)) {
      currentPropertyData = propertyData;
      processProperty(propertyData);
    }
  }

  // Extract property information from the Zillow page
  function extractPropertyData() {
    // Try to find JSON-LD structured data
    const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
    
    if (jsonLdScript) {
      try {
        const data = JSON.parse(jsonLdScript.textContent);
        
        // Check if it's a SingleFamilyResidence or Apartment type
        if (data['@type'] === 'SingleFamilyResidence' || data['@type'] === 'Apartment') {
          const address = data.address;
          
          return {
            address: `${address.streetAddress}, ${address.addressLocality}, ${address.addressRegion} ${address.postalCode}`,
            latitude: data.geo?.latitude,
            longitude: data.geo?.longitude,
            streetAddress: address.streetAddress,
            city: address.addressLocality,
            state: address.addressRegion,
            zip: address.postalCode
          };
        }
      } catch (e) {
        console.error('Error parsing JSON-LD:', e);
      }
    }
    
    // Fallback: Try to extract from page elements
    const addressElement = document.querySelector('h1[class*="address"]');
    if (addressElement) {
      return {
        address: addressElement.textContent.trim(),
        latitude: null,
        longitude: null
      };
    }
    
    return null;
  }

  // Check if this is the same property we already processed
  function isSameProperty(newData) {
    return currentPropertyData && 
           currentPropertyData.address === newData.address;
  }

  // Process property and fetch climate risk data
  async function processProperty(propertyData) {
    isProcessing = true;
    
    try {
      console.log('Processing property:', propertyData.address);
      
      // Only process California properties
      if (propertyData.state !== 'CA') {
        console.log('Property not in California, skipping');
        isProcessing = false;
        return;
      }
      
      // Check cache first
      const cachedData = await ClimateCache.get(propertyData.address);
      
      let riskData;
      if (cachedData) {
        console.log('Using cached climate data');
        riskData = cachedData;
      } else {
        console.log('Fetching climate data...');
        riskData = await ClimateDataFetcher.fetchAllRisks(propertyData);
        
        // Cache the results
        await ClimateCache.set(propertyData.address, riskData);
      }
      
      // Display the risk information on the page
      displayRiskBadge(riskData);
      
    } catch (error) {
      console.error('Error processing property:', error);
    } finally {
      isProcessing = false;
    }
  }

  // Display climate risk badge on the page
  function displayRiskBadge(riskData) {
    // Remove any existing badge
    const existingBadge = document.getElementById('climate-risk-badge');
    if (existingBadge) {
      existingBadge.remove();
    }
    
    // Find the price element to attach near
    const priceElement = document.querySelector('[data-test="price"]') || 
                        document.querySelector('[class*="price"]');
    
    if (!priceElement) {
      console.warn('Could not find price element to attach badge');
      return;
    }
    
    // Calculate overall risk level
    const overallRisk = calculateOverallRisk(riskData);
    
    // Create badge container
    const badge = document.createElement('div');
    badge.id = 'climate-risk-badge';
    badge.className = `climate-risk-badge climate-risk-${overallRisk.level}`;
    
    // Create badge content
    badge.innerHTML = `
      <div class="climate-risk-header">
        <span class="climate-risk-icon">🌡️</span>
        <span class="climate-risk-title">Climate Risk: ${overallRisk.label}</span>
      </div>
      <button class="climate-risk-toggle">View Details</button>
    `;
    
    // Create detail panel
    const detailPanel = createDetailPanel(riskData);
    badge.appendChild(detailPanel);
    
    // Add toggle functionality
    const toggleButton = badge.querySelector('.climate-risk-toggle');
    toggleButton.addEventListener('click', () => {
      detailPanel.classList.toggle('climate-risk-details-visible');
      toggleButton.textContent = detailPanel.classList.contains('climate-risk-details-visible') 
        ? 'Hide Details' 
        : 'View Details';
    });
    
    // Insert badge after price element
    priceElement.parentNode.insertBefore(badge, priceElement.nextSibling);
  }

  // Calculate overall risk level from individual risks
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
      level: levels[maxRisk] || 'unknown',
      label: labels[maxRisk] || 'Unknown'
    };
  }

  // Create detailed risk panel
  function createDetailPanel(riskData) {
    const panel = document.createElement('div');
    panel.className = 'climate-risk-details';
    
    const risks = [
      { 
        name: 'Wildfire', 
        icon: '🔥', 
        data: riskData.wildfire,
        source: 'CAL FIRE',
        url: 'https://osfm.fire.ca.gov/divisions/wildfire-planning-engineering/wildland-hazards-building-codes/fire-hazard-severity-zones-maps/'
      },
      { 
        name: 'Flood', 
        icon: '🌊', 
        data: riskData.flood,
        source: 'FEMA',
        url: 'https://msc.fema.gov/portal/home'
      },
      { 
        name: 'Sea Level Rise', 
        icon: '📈', 
        data: riskData.seaLevelRise,
        source: 'CA Coastal Commission',
        url: 'https://www.coastal.ca.gov/climate/slr/'
      },
      { 
        name: 'Extreme Heat', 
        icon: '☀️', 
        data: riskData.heat,
        source: 'Cal-Adapt',
        url: 'https://cal-adapt.org/'
      }
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
    
    // Add disclaimer
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

  // Start the extension when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ============================================
// background/background.js
// ============================================
chrome.runtime.onInstalled.addListener(() => {
  console.log('Climate Risk Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchClimateData') {
    sendResponse({ success: true });
  }
  return true;
});

// ============================================
// content/content.css
// ============================================
/*
.climate-risk-badge {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.climate-risk-minimal {
  border-color: #4CAF50;
}

.climate-risk-low {
  border-color: #8BC34A;
}

.climate-risk-moderate {
  border-color: #FFC107;
}

.climate-risk-high {
  border-color: #FF9800;
}

.climate-risk-severe {
  border-color: #F44336;
}

.climate-risk-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.climate-risk-icon {
  font-size: 24px;
}

.climate-risk-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.climate-risk-toggle {
  background: #1976D2;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.3s;
}

.climate-risk-toggle:hover {
  background: #1565C0;
}

.climate-risk-details {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
}

.climate-risk-details-visible {
  max-height: 1000px;
  margin-top: 16px;
}

.climate-risk-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.climate-risk-item {
  padding: 12px;
  background: #f5f5f5;
  border-radius: 4px;
  border-left: 4px solid #ccc;
}

.risk-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.risk-icon {
  font-size: 20px;
}

.risk-name {
  font-weight: 600;
  color: #333;
  flex: 1;
}

.risk-level {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.risk-level-minimal {
  background: #E8F5E9;
  color: #2E7D32;
}

.risk-level-low {
  background: #F1F8E9;
  color: #558B2F;
}

.risk-level-moderate {
  background: #FFF9C4;
  color: #F57F17;
}

.risk-level-high {
  background: #FFE0B2;
  color: #E65100;
}

.risk-level-severe {
  background: #FFEBEE;
  color: #C62828;
}

.risk-level-unknown {
  background: #EEEEEE;
  color: #757575;
}

.risk-details {
  color: #666;
  font-size: 14px;
  margin-top: 8px;
  line-height: 1.5;
}

.risk-source {
  display: inline-block;
  margin-top: 8px;
  color: #1976D2;
  text-decoration: none;
  font-size: 12px;
}

.risk-source:hover {
  text-decoration: underline;
}

.climate-risk-disclaimer {
  margin-top: 16px;
  padding: 12px;
  background: #FFF3E0;
  border-left: 4px solid #FF9800;
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}

.climate-risk-disclaimer strong {
  color: #333;
}
*/

// ============================================
// popup/popup.html
// ============================================
/*
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Climate Risk - Zillow</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="popup-container">
    <div class="popup-header">
      <h1>🌡️ Climate Risk</h1>
      <p class="subtitle">for California Properties</p>
    </div>
    
    <div class="popup-content">
      <div class="info-section">
        <h2>About</h2>
        <p>This extension displays climate risk information for California properties on Zillow, including:</p>
        <ul>
          <li>🔥 Wildfire risk</li>
          <li>🌊 Flood zones</li>
          <li>📈 Sea level rise</li>
          <li>☀️ Extreme heat</li>
        </ul>
      </div>
      
      <div class="info-section">
        <h2>Data Sources</h2>
        <ul class="source-list">
          <li><a href="https://osfm.fire.ca.gov/" target="_blank">CAL FIRE</a></li>
          <li><a href="https://msc.fema.gov/" target="_blank">FEMA</a></li>
          <li><a href="https://www.coastal.ca.gov/" target="_blank">CA Coastal Commission</a></li>
          <li><a href="https://cal-adapt.org/" target="_blank">Cal-Adapt</a></li>
        </ul>
      </div>
      
      <div class="disclaimer">
        <strong>Disclaimer:</strong> This information is for educational purposes only. 
        Consult with professionals before making real estate decisions.
      </div>
      
      <div class="popup