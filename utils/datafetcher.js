const ClimateDataFetcher = {
  CAL_ADAPT_BASE_URL: 'https://api.cal-adapt.org/api',
  CALFIRE_FHSZ_URL: 'https://services.gis.ca.gov/arcgis/rest/services/Environment/Fire_Severity_Zones/MapServer/0/query',
  FEMA_NFHL_URL: 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query',
  PRIORITY_GCMS: ['HadGEM2-ES', 'CNRM-CM5', 'CanESM2', 'MIROC5'],
  
  async fetchAllRisks(propertyData) {
    const results = {
      wildfire: null,
      flood: null,
      seaLevelRise: null,
      heat: null
    };
    
    try {
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
  
  async fetchWildfireRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude) {
      return {
        available: false,
        level: 0,
        description: 'Location data unavailable'
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
      details = 'Property is in a High Fire Hazard Severity Zone. Significant wildfire risk based on fuel loading, slope, and fire weather patterns. Defensible space and ignition-resistant construction recommended.';
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
  
  async fetchFloodRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude) {
      console.log('🌊 No coordinates available for flood lookup');
      return {
        available: false,
        level: 0,
        description: 'Location data unavailable'
      };
    }
    
    try {
      const params = new URLSearchParams({
        geometry: `${propertyData.longitude},${propertyData.latitude}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,V_DATUM',
        returnGeometry: 'false',
        f: 'json'
      });
      
      const url = `${this.FEMA_NFHL_URL}?${params}`;
      console.log('🌊 Fetching flood data from FEMA');
      console.log('🌊 Request URL:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`FEMA API returned status ${response.status}`);
      }
      
      const data = await response.json();
      console.log('🌊 FEMA response:', data);
      
      if (data.error) {
        throw new Error(`FEMA API error: ${JSON.stringify(data.error)}`);
      }
      
      if (data.features && data.features.length > 0) {
        const feature = data.features[0].attributes;
        const floodZone = feature.FLD_ZONE;
        const isSFHA = feature.SFHA_TF === 'T';
        const bfe = feature.STATIC_BFE;
        
        console.log('🌊 Flood zone:', floodZone, 'SFHA:', isSFHA);
        
        return this.classifyFloodRisk(floodZone, isSFHA, bfe);
      } else {
        console.log('🌊 No flood zone data found for this location');
        return {
          available: true,
          level: 0,
          description: 'Minimal',
          details: 'Property is not located in a FEMA-designated flood hazard area. Note: This does not mean zero flood risk.'
        };
      }
      
    } catch (error) {
      console.error('🌊 Error fetching flood risk:', error);
      return {
        available: false,
        level: 0,
        description: 'Error fetching data',
        details: `Unable to retrieve flood data: ${error.message}`
      };
    }
  },
  
  classifyFloodRisk(floodZone, isSFHA, bfe) {
    let level, description, details;
    
    if (floodZone.startsWith('V')) {
      level = 4;
      description = 'Severe';
      details = `Property is in Zone ${floodZone}, a high-risk coastal flood area with wave action (1% annual chance). Flood insurance required for mortgages. Elevated construction required.`;
    } else if (floodZone.startsWith('A') || isSFHA) {
      level = 3;
      description = 'High';
      const bfeText = bfe ? ` Base flood elevation: ${bfe} feet.` : '';
      details = `Property is in Zone ${floodZone}, a high-risk flood area (1% annual chance of flooding each year).${bfeText} Flood insurance required for mortgages.`;
    } else if (floodZone === 'X' || floodZone.includes('0.2')) {
      level = 2;
      description = 'Moderate';
      details = `Property is in Zone ${floodZone}, a moderate-risk flood area (0.2% annual chance). Flood insurance recommended but not required.`;
    } else if (floodZone === 'D') {
      level = 1;
      description = 'Unknown';
      details = 'Property is in Zone D where flood hazards are undetermined. Flood insurance availability may be limited.';
    } else {
      level = 0;
      description = 'Minimal';
      details = `Property is in Zone ${floodZone}, an area of minimal flood risk.`;
    }
    
    return {
      available: true,
      level: level,
      description: description,
      details: details,
      rawData: {
        floodZone: floodZone,
        isSFHA: isSFHA,
        baseFloodElevation: bfe
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
        headers: {
          'Accept': 'application/json'
        }
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