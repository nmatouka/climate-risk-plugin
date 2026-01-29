const ClimateDataFetcher = {
  CAL_ADAPT_BASE_URL: 'https://api.cal-adapt.org/api',
  CALFIRE_FHSZ_URL: 'https://services.gis.ca.gov/arcgis/rest/services/Environment/Fire_Severity_Zones/MapServer/0/query',
  FLOOD_ZONES_URL: 'https://nmatouka.github.io/climate-risk-plugin/flood-zone-data/flood_zones_simplified.geojson',
  PRIORITY_GCMS: ['HadGEM2-ES', 'CNRM-CM5', 'CanESM2', 'MIROC5'],
  
  floodZoneData: null,
  floodZoneDataLoading: false,
  floodZoneLoadPromise: null,
  
  async withTimeout(promise, timeoutMs, name = 'Operation') {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  },
  
  async fetchAllRisks(propertyData) {
    const results = {
      wildfire: null,
      flood: null,
      seaLevelRise: null,
      heat: null
    };
    
    if (!propertyData || typeof propertyData !== 'object') {
      console.error('🌡️ Invalid property data');
      return results;
    }
    
    try {
      const [wildfire, flood, seaLevelRise, heat] = await Promise.allSettled([
        this.withTimeout(this.fetchWildfireRisk(propertyData), 10000, 'Wildfire'),
        this.withTimeout(this.fetchFloodRiskLocal(propertyData), 30000, 'Flood'),
        this.withTimeout(this.fetchSeaLevelRiseRisk(propertyData), 5000, 'SeaLevel'),
        this.withTimeout(this.fetchHeatRisk(propertyData), 15000, 'Heat')
      ]);
      
      if (wildfire.status === 'fulfilled') results.wildfire = wildfire.value;
      else console.warn('🌡️ Wildfire fetch failed:', wildfire.reason?.message);
      
      if (flood.status === 'fulfilled') results.flood = flood.value;
      else console.warn('🌡️ Flood fetch failed:', flood.reason?.message);
      
      if (seaLevelRise.status === 'fulfilled') results.seaLevelRise = seaLevelRise.value;
      else console.warn('🌡️ Sea level rise fetch failed:', seaLevelRise.reason?.message);
      
      if (heat.status === 'fulfilled') results.heat = heat.value;
      else console.warn('🌡️ Heat fetch failed:', heat.reason?.message);
      
    } catch (error) {
      console.error('🌡️ Error fetching climate risks:', error);
    }
    
    return results;
  },
  
  async loadFloodZoneData() {
    if (this.floodZoneData) {
      console.log('🌊 Returning cached flood data');
      return this.floodZoneData;
    }
    
    if (this.floodZoneDataLoading) {
      return this.floodZoneLoadPromise;
    }
    
    this.floodZoneDataLoading = true;
    this.floodZoneLoadPromise = (async () => {
      try {
        console.log('🌊 Loading flood zone data from GitHub Pages...');
        const startTime = performance.now();
        
        const response = await fetch(this.FLOOD_ZONES_URL, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors'
        });
        
        if (!response.ok) {
          throw new Error(`Failed to load flood data: ${response.status} ${response.statusText}`);
        }
        
        const geojson = await response.json();
        const loadTime = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`🌊 Flood data loaded in ${loadTime}s (${geojson.features?.length || 0} features)`);
        
        // PRIORITY 2 FIX: Pre-calculate bounding boxes if missing
        if (geojson.features && geojson.features.length > 0) {
          let calculatedCount = 0;
          for (const feature of geojson.features) {
            if (!feature.bbox && feature.geometry) {
              feature.bbox = this.calculateBoundingBox(feature.geometry);
              calculatedCount++;
            }
          }
          if (calculatedCount > 0) {
            console.log(`🌊 Calculated ${calculatedCount} missing bounding boxes`);
          }
        }
        
        this.floodZoneData = geojson;
        return geojson;
        
      } catch (error) {
        console.error('🌊 Error loading flood zone data:', error);
        throw error;
      } finally {
        this.floodZoneDataLoading = false;
      }
    })();
    
    return this.floodZoneLoadPromise;
  },
  
  // PRIORITY 2 FIX: New function to calculate bounding boxes
  calculateBoundingBox(geometry) {
    if (!geometry || !geometry.coordinates) return null;
    
    const coords = [];
    
    const extractCoords = (coordArray) => {
      if (Array.isArray(coordArray[0])) {
        coordArray.forEach(extractCoords);
      } else {
        coords.push(coordArray);
      }
    };
    
    extractCoords(geometry.coordinates);
    
    if (coords.length === 0) return null;
    
    const lons = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    
    return [
      Math.min(...lons),  // minX
      Math.min(...lats),  // minY
      Math.max(...lons),  // maxX
      Math.max(...lats)   // maxY
    ];
  },
  
  // PRIORITY 2 FIX: New function for fast rejection test
  hasBoundingBoxIntersection(point, feature) {
    if (!feature.bbox || !Array.isArray(feature.bbox) || feature.bbox.length !== 4) {
      return true; // No bbox available, must check geometry
    }
    
    const [x, y] = point;
    const [minX, minY, maxX, maxY] = feature.bbox;
    
    // Quick rejection: check if point is outside bounding box
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  },
  
  pointInPolygon(point, polygon) {
    if (!Array.isArray(point) || point.length !== 2) return false;
    if (!Array.isArray(polygon) || polygon.length === 0) return false;
    
    const [x, y] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  },
  
  pointInGeometry(point, geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) {
      return false;
    }
    
    const { type, coordinates } = geometry;
    
    if (type === 'Polygon') {
      return this.pointInPolygon(point, coordinates[0]);
    } else if (type === 'MultiPolygon') {
      for (const polygon of coordinates) {
        const exteriorRing = polygon[0];
        if (this.pointInPolygon(point, exteriorRing)) {
          if (polygon.length > 1) {
            for (let i = 1; i < polygon.length; i++) {
              if (this.pointInPolygon(point, polygon[i])) {
                return false;
              }
            }
          }
          return true;
        }
      }
    }
    
    return false;
  },
  
  async fetchFloodRiskLocal(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude) {
      console.log('🌊 No coordinates available for flood lookup');
      return {
        available: false,
        level: 0,
        description: 'Location data unavailable',
        details: 'Coordinates not found. Cannot determine flood zone.'
      };
    }
    
    if (typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      console.warn('🌊 Invalid coordinate types');
      return {
        available: false,
        level: 0,
        description: 'Invalid coordinates',
        details: 'Coordinate data is not in valid format.'
      };
    }
    
    try {
      const geojson = await this.loadFloodZoneData();
      
      const point = [propertyData.longitude, propertyData.latitude];
      console.log('🌊 Checking flood zones for:', point);
      
      const matchingZones = [];
      
      // PRIORITY 2 FIX: Added performance counter
      const startCheck = performance.now();
      let bboxRejections = 0;
      let bboxAccepts = 0;
      let geometryChecks = 0;
      
      for (const feature of geojson.features) {
        // PRIORITY 2 FIX: Fast bounding box rejection test
        if (!this.hasBoundingBoxIntersection(point, feature)) {
          bboxRejections++;
          continue; // Skip expensive geometry check
        }
        
        bboxAccepts++;
        
        // Only do expensive geometry check if bbox intersects
        if (this.pointInGeometry(point, feature.geometry)) {
          geometryChecks++;
          const zone = feature.properties.FLD_ZONE;
          const riskLevel = feature.properties.risk_level;
          
          matchingZones.push({
            zone: zone,
            riskLevel: riskLevel,
            properties: feature.properties
          });
        }
      }
      
      // PRIORITY 2 FIX: Log performance metrics
      const checkTime = ((performance.now() - startCheck) / 1000).toFixed(3);
      console.log(`🌊 Flood check completed in ${checkTime}s (bbox rejected: ${bboxRejections}, accepted: ${bboxAccepts}, geometry checks: ${geometryChecks})`);
      
      if (matchingZones.length === 0) {
        console.log('🌊 No flood zone found for this location');
        return {
          available: true,
          level: 0,
          description: 'Minimal',
          details: 'Property is not in a mapped FEMA flood zone. Note: Flood risk can exist outside mapped zones.',
          isInFloodZone: false
        };
      }
      
      const riskOrder = { 'very_high': 4, 'high': 3, 'moderate': 2, 'low': 1, 'minimal': 0 };
      const highestRisk = matchingZones.reduce((max, zone) => {
        return (riskOrder[zone.riskLevel] > riskOrder[max.riskLevel]) ? zone : max;
      });
      
      console.log('🌊 Found flood zone:', highestRisk.zone, 'Risk:', highestRisk.riskLevel);
      
      return this.classifyFloodRiskLocal(highestRisk.zone, highestRisk.riskLevel);
      
    } catch (error) {
      console.error('🌊 Error fetching local flood risk:', error);
      return {
        available: false,
        level: 0,
        description: 'Error fetching data',
        details: `Unable to load flood zone data: ${error.message}`
      };
    }
  },
  
  classifyFloodRiskLocal(floodZone, riskLevel) {
    const riskLevels = {
      'very_high': 4,
      'high': 3,
      'moderate': 2,
      'low': 1,
      'minimal': 0
    };
    
    const level = riskLevels[riskLevel] || 0;
    let description, details;
    
    if (floodZone.startsWith('V')) {
      description = 'Severe';
      details = `Property is in FEMA Flood Zone ${floodZone}, a high-risk coastal area with wave action (1% annual chance of flooding). Flood insurance is required for federally backed mortgages.`;
    } else if (floodZone.startsWith('A')) {
      description = 'High';
      details = `Property is in FEMA Flood Zone ${floodZone}, a Special Flood Hazard Area with 1% annual chance of flooding. Flood insurance is required for federally backed mortgages.`;
    } else if (floodZone === 'X' || floodZone.includes('0.2')) {
      description = 'Moderate';
      details = `Property is in FEMA Flood Zone ${floodZone}, a moderate-risk area (0.2% annual chance of flooding). Flood insurance is recommended but not typically required.`;
    } else {
      description = 'Low';
      details = `Property is in FEMA Flood Zone ${floodZone}.`;
    }
    
    return {
      available: true,
      level: level,
      description: description,
      details: details,
      isInFloodZone: level > 0,
      rawData: {
        floodZone: floodZone,
        riskLevel: riskLevel
      }
    };
  },
  
  async fetchWildfireRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude) {
      return {
        available: false,
        level: 0,
        description: 'Location data unavailable'
      };
    }
    
    if (typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return {
        available: false,
        level: 0,
        description: 'Invalid coordinates'
      };
    }
    
    try {
      const params = new URLSearchParams({
        geometry: `${propertyData.longitude},${propertyData.latitude}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'HAZ_CLASS,HAZ_CODE,SRA',
        returnGeometry: 'false',
        f: 'json'
      });
      
      const url = `${this.CALFIRE_FHSZ_URL}?${params}`;
      console.log('🔥 Fetching wildfire data from CAL FIRE');
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`CAL FIRE API returned status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`CAL FIRE API error: ${data.error.message || 'Unknown error'}`);
      }
      
      if (data.features && data.features.length > 0) {
        const feature = data.features[0].attributes;
        const hazClass = feature.HAZ_CLASS;
        const hazCode = feature.HAZ_CODE;
        
        console.log('🔥 Wildfire hazard class:', hazClass);
        
        return this.classifyWildfireRisk(hazClass, hazCode);
      } else {
        return {
          available: true,
          level: 0,
          description: 'Minimal',
          details: 'Property is not located in a designated fire hazard severity zone.'
        };
      }
      
    } catch (error) {
      console.error('🔥 Error fetching wildfire risk:', error);
      return {
        available: false,
        level: 0,
        description: 'Error fetching data',
        details: `Unable to retrieve wildfire data: ${error.message}`
      };
    }
  },
  
  classifyWildfireRisk(hazClass, hazCode) {
    let level, description, details;
    
    if (!hazClass || hazClass === 'Non-Wildland/Non-Urban') {
      level = 0;
      description = 'Minimal';
      details = 'Property is in a non-wildland/non-urban area with minimal wildfire risk.';
    } else if (hazClass === 'Moderate' || hazCode === 1) {
      level = 2;
      description = 'Moderate';
      details = 'Property is in a Moderate Fire Hazard Severity Zone. Some wildfire risk exists based on fuel loading, slope, and fire weather conditions.';
    } else if (hazClass === 'High' || hazCode === 2) {
      level = 3;
      description = 'High';
      details = 'Property is in a High Fire Hazard Severity Zone. Significant wildfire risk. Defensible space and ignition-resistant construction recommended.';
    } else if (hazClass === 'Very High' || hazCode === 3) {
      level = 4;
      description = 'Severe';
      details = 'Property is in a Very High Fire Hazard Severity Zone. Extreme wildfire risk. Defensible space, ignition-resistant construction, and evacuation planning are critical.';
    } else {
      level = 1;
      description = 'Low';
      details = `Property is in fire hazard zone: ${hazClass}. Some wildfire risk may exist.`;
    }
    
    return {
      available: true,
      level: level,
      description: description,
      details: details,
      rawData: {
        hazardClass: hazClass,
        hazardCode: hazCode
      }
    };
  },
  
  async fetchSeaLevelRiseRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude) {
      console.log('📈 No coordinates available for sea level rise lookup');
      return {
        available: false,
        level: 0,
        description: 'Location data unavailable'
      };
    }
    
    if (typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return {
        available: false,
        level: 0,
        description: 'Invalid coordinates'
      };
    }
    
    console.log('📈 Checking if property is near coast...');
    const isNearCoast = this.isNearCaliforniaCoast(
      propertyData.latitude, 
      propertyData.longitude
    );
    
    console.log('📈 Near coast?', isNearCoast);
    
    if (!isNearCoast) {
      return {
        available: true,
        level: 0,
        description: 'Not applicable',
        details: 'Property is not in coastal zone.'
      };
    }
    
    return {
      available: false,
      level: 0,
      description: 'Data pending',
      details: 'Sea level rise vulnerability data for coastal properties will be available in a future update.'
    };
  },
  
  async fetchHeatRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude) {
      return {
        available: false,
        level: 0,
        description: 'Location data unavailable'
      };
    }
    
    if (typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return {
        available: false,
        level: 0,
        description: 'Invalid coordinates'
      };
    }
    
    try {
      const slug = 'tasmax_day_HadGEM2-ES_rcp85';
      const point = `POINT(${propertyData.longitude} ${propertyData.latitude})`;
      
      const startDate = '2050-01-01';
      const endDate = '2060-12-31';
      
      const url = `${this.CAL_ADAPT_BASE_URL}/series/${slug}/events/?` + 
        `g=${encodeURIComponent(point)}&` +
        `stat=mean&` +
        `freq=YS&` +
        `start=${startDate}&` +
        `end=${endDate}`;
      
      console.log('☀️ Fetching extreme heat data from Cal-Adapt');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`Cal-Adapt API returned status ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.data || result.data.length === 0) {
        throw new Error('No temperature data returned from Cal-Adapt');
      }
      
      let totalMaxTemp = 0;
      let count = 0;
      
      result.data.forEach(yearData => {
        if (yearData && Array.isArray(yearData) && yearData[2] != null) {
          totalMaxTemp += yearData[2];
          count++;
        }
      });
      
      if (count === 0) {
        throw new Error('Unable to calculate temperature statistics');
      }
      
      const avgMaxTempK = totalMaxTemp / count;
      const avgMaxTempF = this.kelvinToFahrenheit(avgMaxTempK);
      
      return this.classifyHeatRisk(avgMaxTempF);
      
    } catch (error) {
      console.error('☀️ Error fetching heat risk from Cal-Adapt:', error);
      return {
        available: false,
        level: 0,
        description: 'Error fetching data',
        details: `Unable to retrieve extreme heat data: ${error.message}`
      };
    }
  },
  
  kelvinToFahrenheit(kelvin) {
    return (kelvin - 273.15) * 9/5 + 32;
  },
  
  classifyHeatRisk(avgMaxTempF) {
    let level, description, details;
    
    if (avgMaxTempF < 95) {
      level = 0;
      description = 'Minimal';
      details = `Projected average maximum temperature of ${Math.round(avgMaxTempF)}°F by mid-century (2050-2060). Moderate summer heat expected.`;
    } else if (avgMaxTempF < 100) {
      level = 1;
      description = 'Low';
      details = `Projected average maximum temperature of ${Math.round(avgMaxTempF)}°F by mid-century (2050-2060). Hot summers expected, adequate cooling recommended.`;
    } else if (avgMaxTempF < 105) {
      level = 2;
      description = 'Moderate';
      details = `Projected average maximum temperature of ${Math.round(avgMaxTempF)}°F by mid-century (2050-2060). Very hot summers expected. Reliable air conditioning essential.`;
    } else if (avgMaxTempF < 110) {
      level = 3;
      description = 'High';
      details = `Projected average maximum temperature of ${Math.round(avgMaxTempF)}°F by mid-century (2050-2060). Extreme heat expected regularly. Significant cooling infrastructure needed.`;
    } else {
      level = 4;
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
  
  isNearCaliforniaCoast(lat, lon) {
    const coastalThreshold = 0.15;
    
    if (lat >= 37.5 && lat <= 42 && lon >= -124.5 && lon <= -123.5 + coastalThreshold) {
      return true;
    }
    
    if (lat >= 37 && lat <= 38.5 && lon >= -123 && lon <= -122 + coastalThreshold) {
      return true;
    }
    
    if (lat >= 34.5 && lat <= 37 && lon >= -122.5 && lon <= -120 + coastalThreshold) {
      return true;
    }
    
    if (lat >= 32.5 && lat <= 34.5 && lon >= -120 && lon <= -117 + coastalThreshold) {
      return true;
    }
    
    return false;
  }
};