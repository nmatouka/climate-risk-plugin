// ============================================
// CLIMATE DATA FETCHER
// ============================================
// v3.0 Changes:
//   - Extreme heat days: direct daily count from Cal-Adapt (replaces estimation formula)
//     Threshold changed to 95°F (matching Cal-Adapt/Climateshed methodology)
//   - Wildfire: queries both SRA (layer 0) and LRA (layer 1), takes highest result
//   - Flood: switched from local GeoJSON to live FEMA NFHL API; adds SFHA_TF classification
//   - Flood projection: FC-FIRM future-conditions zones extracted from same FEMA response
//   - Wildfire projection: Cal-Adapt decadal fire probability (UC Merced model)
//   - Precipitation: corrected unit conversion from kg/m²/s to annual inches
// ============================================

const CLIMATE_CONSTANTS = {
  CAL_ADAPT_BASE_URL: 'https://api.cal-adapt.org/api',

  // CAL FIRE — must query both SRA (layer 0) and LRA (layer 1).
  // A given address may only be designated in one layer; a single-layer query misses valid designations.
  CALFIRE_FHSZ_LAYERS: [
    'https://services.gis.ca.gov/arcgis/rest/services/Environment/Fire_Severity_Zones/MapServer/0/query',
    'https://services.gis.ca.gov/arcgis/rest/services/Environment/Fire_Severity_Zones/MapServer/1/query'
  ],

  // FEMA National Flood Hazard Layer — Layer 28 (Flood Hazard Zones)
  // Returns FLD_ZONE (current zone), ZONE_SUBTY (includes FC-FIRM future-conditions), SFHA_TF
  FEMA_NFHL_URL: 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query',

  SLUGS: {
    TASMAX:          'tasmax_day_HadGEM2-ES_rcp85',           // Daily max temperature
    PRECIP:          'pr_day_HadGEM2-ES_rcp85',               // Daily precipitation rate (future)
    PRECIP_HIST:     'pr_day_HadGEM2-ES_historical',          // Daily precipitation rate (historical baseline)
    FIRE_PROB:       'fireprob_10y_HadGEM2-ES_rcp85_bau'      // Decadal wildfire probability (UC Merced)
  },

  HISTORICAL: { start: '1981-01-01', end: '2010-12-31' },

  MID_CENTURY: { start: '2050-01-01', end: '2060-12-31' }
};

const ClimateDataFetcher = {
  CAL_ADAPT_BASE_URL: CLIMATE_CONSTANTS.CAL_ADAPT_BASE_URL,

  DEBUG: false,

  debug(...args) {
    if (this.DEBUG) console.log(...args);
  },

  logError(emoji, message, error) {
    if (this.DEBUG) console.error(`${emoji} ${message}:`, error);
  },

  async withTimeout(promise, timeoutMs, name = 'Operation') {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  },

  // ============================================
  // MAIN FETCH FUNCTION
  // ============================================

  async fetchAllRisks(propertyData) {
    const results = {
      wildfire: null,
      wildfireProjection: null,
      flood: null,
      floodProjection: null,
      seaLevelRise: null,
      heat: null,
      extremeHeatDays: null,
      extremePrecipitation: null
    };

    if (!propertyData || typeof propertyData !== 'object') {
      this.logError('', 'Invalid property data', new Error('Missing or invalid property data'));
      return results;
    }

    try {
      this.debug('Fetching all climate risks...');

      const [
        wildfire,
        wildfireProjection,
        flood,
        seaLevelRise,
        heat,
        extremeHeatDays,
        extremePrecipitation
      ] = await Promise.allSettled([
        this.withTimeout(this.fetchWildfireRisk(propertyData), 10000, 'Wildfire'),
        this.withTimeout(this.fetchWildfireProjection(propertyData), 15000, 'WildfireProjection'),
        this.withTimeout(this.fetchFloodRisks(propertyData), 15000, 'Flood'),
        this.withTimeout(this.fetchSeaLevelRiseRisk(propertyData), 5000, 'SeaLevel'),
        this.withTimeout(this.fetchHeatRisk(propertyData), 15000, 'Heat'),
        this.withTimeout(this.fetchExtremeHeatDays(propertyData), 30000, 'ExtremeHeatDays'),
        this.withTimeout(this.fetchExtremePrecipitationRisk(propertyData), 15000, 'ExtremePrecip')
      ]);

      if (wildfire.status === 'fulfilled') results.wildfire = wildfire.value;
      else this.logError('🔥', 'Wildfire fetch failed', wildfire.reason);

      if (wildfireProjection.status === 'fulfilled') results.wildfireProjection = wildfireProjection.value;
      else this.logError('🔥', 'Wildfire projection fetch failed', wildfireProjection.reason);

      if (flood.status === 'fulfilled') {
        results.flood = flood.value.current;
        results.floodProjection = flood.value.projected;
      } else {
        this.logError('🌊', 'Flood fetch failed', flood.reason);
      }

      if (seaLevelRise.status === 'fulfilled') results.seaLevelRise = seaLevelRise.value;
      else this.logError('📈', 'Sea level rise fetch failed', seaLevelRise.reason);

      if (heat.status === 'fulfilled') results.heat = heat.value;
      else this.logError('☀️', 'Heat fetch failed', heat.reason);

      if (extremeHeatDays.status === 'fulfilled') results.extremeHeatDays = extremeHeatDays.value;
      else this.logError('🔆', 'Extreme heat days fetch failed', extremeHeatDays.reason);

      if (extremePrecipitation.status === 'fulfilled') results.extremePrecipitation = extremePrecipitation.value;
      else this.logError('🌧️', 'Extreme precipitation fetch failed', extremePrecipitation.reason);

    } catch (error) {
      this.logError('', 'Error fetching climate risks', error);
    }

    return results;
  },

  // ============================================
  // WILDFIRE — Current FHSZ (SRA layer 0 + LRA layer 1)
  // ============================================

  async fetchWildfireRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude ||
        typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return { available: false, level: 0, description: 'Location data unavailable' };
    }

    const params = new URLSearchParams({
      geometry: `${propertyData.longitude},${propertyData.latitude}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'HAZ_CLASS,HAZ_CODE,SRA',
      returnGeometry: 'false',
      f: 'json'
    });

    // Query both layers in parallel; take the highest-risk result across both.
    const [layer0, layer1] = await Promise.allSettled([
      fetch(`${CLIMATE_CONSTANTS.CALFIRE_FHSZ_LAYERS[0]}?${params}`).then(r => {
        if (!r.ok) throw new Error(`CAL FIRE layer 0 returned ${r.status}`);
        return r.json();
      }),
      fetch(`${CLIMATE_CONSTANTS.CALFIRE_FHSZ_LAYERS[1]}?${params}`).then(r => {
        if (!r.ok) throw new Error(`CAL FIRE layer 1 returned ${r.status}`);
        return r.json();
      })
    ]);

    const hazRank = { 'Very High': 3, 'High': 2, 'Moderate': 1 };
    let best = null;
    let bestRank = -1;

    for (const result of [layer0, layer1]) {
      if (result.status !== 'fulfilled') continue;
      const data = result.value;
      if (data.error || !data.features || !data.features.length) continue;
      const attr = data.features[0].attributes;
      const rank = hazRank[attr.HAZ_CLASS] ?? 0;
      if (rank > bestRank) { best = attr; bestRank = rank; }
    }

    if (!best) {
      return {
        available: true,
        level: 0,
        description: 'Minimal',
        details: 'Property is not located in a designated CAL FIRE Fire Hazard Severity Zone.'
      };
    }

    return this.classifyWildfireRisk(best.HAZ_CLASS, best.HAZ_CODE);
  },

  classifyWildfireRisk(hazClass, hazCode) {
    let level, description, details;

    if (!hazClass || hazClass === 'Non-Wildland/Non-Urban') {
      level = 0; description = 'Minimal';
      details = 'Property is in a non-wildland/non-urban area with minimal wildfire risk.';
    } else if (hazClass === 'Moderate' || hazCode === 1) {
      level = 2; description = 'Moderate';
      details = 'Property is in a Moderate Fire Hazard Severity Zone. Some wildfire risk exists based on fuel loading, slope, and fire weather conditions.';
    } else if (hazClass === 'High' || hazCode === 2) {
      level = 3; description = 'High';
      details = 'Property is in a High Fire Hazard Severity Zone. Significant wildfire risk. Defensible space and ignition-resistant construction recommended.';
    } else if (hazClass === 'Very High' || hazCode === 3) {
      level = 4; description = 'Severe';
      details = 'Property is in a Very High Fire Hazard Severity Zone. Extreme wildfire risk. Defensible space, ignition-resistant construction, and evacuation planning are critical.';
    } else {
      level = 1; description = 'Low';
      details = `Property is in fire hazard zone: ${hazClass}. Some wildfire risk may exist.`;
    }

    return { available: true, level, description, details, rawData: { hazardClass: hazClass, hazardCode: hazCode } };
  },

  // ============================================
  // WILDFIRE — Mid-Century Probability Projection (Cal-Adapt / UC Merced)
  // ============================================

  async fetchWildfireProjection(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude ||
        typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return { available: false, level: 0, description: 'Location data unavailable' };
    }

    try {
      const point = encodeURIComponent(`POINT(${propertyData.longitude} ${propertyData.latitude})`);
      const url = `${CLIMATE_CONSTANTS.CAL_ADAPT_BASE_URL}/series/${CLIMATE_CONSTANTS.SLUGS.FIRE_PROB}/events/?g=${point}&stat=max&format=json`;

      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`Cal-Adapt API returned ${response.status}`);

      const result = await response.json();
      if (!result.index || !result.data) throw new Error('No fire probability data returned');

      // Find the 2050-decade entry in the time series index.
      // data values can be null for locations outside the model coverage area.
      const idx = result.index.findIndex(ts => String(ts).includes('2050'));
      const prob2050 = idx >= 0 ? result.data[idx] : null;

      return this.classifyWildfireProjection(prob2050);

    } catch (error) {
      this.logError('🔥', 'Error fetching wildfire projection', error);
      return {
        available: false, level: 0,
        description: 'Data unavailable',
        details: 'Unable to retrieve wildfire projection data at this time. Please try again later.'
      };
    }
  },

  classifyWildfireProjection(prob) {
    if (prob === null || prob === undefined) {
      return {
        available: false, level: 0,
        description: 'Data unavailable',
        details: 'Wildfire probability projection data is not available for this location. The location may be outside the Cal-Adapt model coverage area.'
      };
    }

    const pct = Math.round(prob * 100);
    let level, description, details;

    if (prob < 0.03) {
      level = 0; description = 'Minimal';
      details = `Cal-Adapt projects approximately ${pct}% probability of wildfire occurrence in the 2050s decade (UC Merced model, RCP 8.5 high-emissions scenario). Very low projected wildfire probability.`;
    } else if (prob < 0.07) {
      level = 1; description = 'Low';
      details = `Cal-Adapt projects approximately ${pct}% probability of wildfire occurrence in the 2050s decade. Low projected wildfire probability.`;
    } else if (prob < 0.15) {
      level = 2; description = 'Moderate';
      details = `Cal-Adapt projects approximately ${pct}% probability of wildfire occurrence in the 2050s decade. Moderate projected wildfire probability — wildfire preparedness is advisable.`;
    } else if (prob < 0.25) {
      level = 3; description = 'High';
      details = `Cal-Adapt projects approximately ${pct}% probability of wildfire occurrence in the 2050s decade. High projected wildfire probability — defensible space and evacuation planning are important.`;
    } else {
      level = 4; description = 'Severe';
      details = `Cal-Adapt projects approximately ${pct}% probability of wildfire occurrence in the 2050s decade. Severe projected wildfire probability — among the most at-risk areas in California.`;
    }

    return { available: true, level, description, details, rawData: { probability: prob, probabilityPct: pct } };
  },

  // ============================================
  // FLOOD — Current + Projected FC-FIRM (single FEMA NFHL API call)
  // ============================================

  async fetchFloodRisks(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude ||
        typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      const unavailable = {
        available: false, level: 0,
        description: 'Location data unavailable',
        details: 'Coordinates not found. Cannot determine flood zone.'
      };
      return { current: unavailable, projected: { ...unavailable } };
    }

    const params = new URLSearchParams({
      where: '1=1',
      geometry: `${propertyData.longitude},${propertyData.latitude}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF',
      returnGeometry: 'false',
      f: 'json'
    });

    let data;
    try {
      const response = await fetch(`${CLIMATE_CONSTANTS.FEMA_NFHL_URL}?${params}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`FEMA API returned ${response.status}`);
      data = await response.json();
      if (data.error) throw new Error(`FEMA API error: ${data.error.message}`);
    } catch (error) {
      // Single retry after 2 seconds — FEMA's service occasionally resets connections.
      await new Promise(resolve => setTimeout(resolve, 2000));
      const response = await fetch(`${CLIMATE_CONSTANTS.FEMA_NFHL_URL}?${params}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) throw new Error(`FEMA API returned ${response.status}`);
      data = await response.json();
      if (data.error) throw new Error(`FEMA API error: ${data.error.message}`);
    }

    const features = (data.features || []).map(f => f.attributes);

    return {
      current: this.classifyCurrentFlood(features),
      projected: this.classifyProjectedFlood(features)
    };
  },

  floodRank(attrs) {
    if (attrs.FLD_ZONE && attrs.FLD_ZONE.startsWith('V')) return 4;
    if (attrs.SFHA_TF === 'T')                            return 3;
    // Zone X shaded (0.2% annual chance) has FLD_ZONE='X' and ZONE_SUBTY containing '0.2 PCT'.
    // FLD_ZONE itself never contains '0.2' — checking it was a dead code path.
    if (attrs.ZONE_SUBTY && attrs.ZONE_SUBTY.toUpperCase().includes('0.2 PCT')) return 2;
    if (attrs.FLD_ZONE)                                   return 1;
    return 0;
  },

  classifyCurrentFlood(features) {
    if (!features.length) {
      return {
        available: true, level: 0,
        description: 'Minimal',
        details: 'No FEMA flood zone data found for this location. Visit the FEMA Flood Map Service Center for the official Flood Insurance Rate Map.',
        isInFloodZone: false
      };
    }

    // FEMA can return multiple overlapping polygons — rank all and use the highest.
    const best = features.reduce((a, b) => this.floodRank(a) >= this.floodRank(b) ? a : b);

    if (best.FLD_ZONE && best.FLD_ZONE.startsWith('V')) {
      return {
        available: true, level: 4, description: 'Severe',
        details: `Property is in FEMA Flood Zone ${best.FLD_ZONE}, a high-risk coastal area with wave action (1% annual chance of flooding). Flood insurance is required for federally backed mortgages.`,
        isInFloodZone: true, rawData: { floodZone: best.FLD_ZONE }
      };
    } else if (best.SFHA_TF === 'T') {
      return {
        available: true, level: 3, description: 'High',
        details: `Property is in FEMA Flood Zone ${best.FLD_ZONE || 'SFHA'}, a Special Flood Hazard Area with 1% annual chance of flooding — roughly 26% cumulative probability over a 30-year mortgage. Flood insurance is required for federally backed mortgages.`,
        isInFloodZone: true, rawData: { floodZone: best.FLD_ZONE }
      };
    } else if (best.ZONE_SUBTY && best.ZONE_SUBTY.toUpperCase().includes('0.2 PCT')) {
      return {
        available: true, level: 2, description: 'Moderate',
        details: `Property is in FEMA Flood Zone ${best.FLD_ZONE || 'X'} (0.2% annual chance — 500-year flood zone). Moderate flood risk — flood insurance is recommended but not federally required for federally backed mortgages.`,
        isInFloodZone: true, rawData: { floodZone: best.FLD_ZONE }
      };
    } else if (best.FLD_ZONE) {
      return {
        available: true, level: 1, description: 'Low',
        details: `Property is in FEMA Flood Zone ${best.FLD_ZONE}. Outside the Special Flood Hazard Area — annual flood probability is below 0.2%.`,
        isInFloodZone: true, rawData: { floodZone: best.FLD_ZONE }
      };
    } else {
      return {
        available: true, level: 0, description: 'Minimal',
        details: 'Property is not in a mapped FEMA flood zone. Note: Flood risk can exist outside mapped zones.',
        isInFloodZone: false
      };
    }
  },

  classifyProjectedFlood(features) {
    // FC-FIRM future-conditions zones are identified by ZONE_SUBTY containing "FUTURE".
    const futureFeatures = features.filter(f =>
      f.ZONE_SUBTY && f.ZONE_SUBTY.toUpperCase().includes('FUTURE')
    );

    if (!futureFeatures.length) {
      return {
        available: false, level: 0,
        description: 'Not mapped',
        details: 'FEMA Future Conditions flood data (FC-FIRM) is not available for this location. FC-FIRM coverage is expanding nationally — most locations return unavailable not because future risk is absent, but because FEMA has not yet completed mapping for that area.'
      };
    }

    const futureRank = (subty) => {
      const s = (subty || '').toUpperCase();
      if (s.includes('1 PCT FUTURE') || s.includes('100-YEAR FUTURE')) return 2;
      if (s.includes('0.2 PCT FUTURE') || s.includes('500-YEAR FUTURE')) return 1;
      return 0;
    };

    const best = futureFeatures.reduce((a, b) =>
      futureRank(a.ZONE_SUBTY) >= futureRank(b.ZONE_SUBTY) ? a : b
    );
    const rank = futureRank(best.ZONE_SUBTY);

    if (rank === 2) {
      return {
        available: true, level: 3, description: 'High',
        details: "FEMA projects this location will fall within the 1%-annual-chance floodplain under future conditions (FC-FIRM). Important: FC-FIRM reflects anticipated changes in land use and hydrology (e.g., upstream development and altered drainage) — not specifically climate change projections. Check the Flood card for the current regulatory designation.",
        rawData: { zoneSubtype: best.ZONE_SUBTY }
      };
    } else if (rank === 1) {
      return {
        available: true, level: 2, description: 'Moderate',
        details: "FEMA projects this location will fall within the 0.2%-annual-chance floodplain under future conditions (FC-FIRM). Important: FC-FIRM reflects anticipated changes in land use and hydrology — not specifically climate change projections. The current regulatory designation may differ — check the Flood card.",
        rawData: { zoneSubtype: best.ZONE_SUBTY }
      };
    } else {
      return {
        available: true, level: 1, description: 'Low',
        details: `FEMA has mapped a future conditions flood designation at this location (${best.ZONE_SUBTY}). FC-FIRM reflects anticipated changes in land use and hydrology, not specifically climate change. See the FEMA Flood Map Service Center for full FC-FIRM details.`,
        rawData: { zoneSubtype: best.ZONE_SUBTY }
      };
    }
  },

  // ============================================
  // EXTREME HEAT — Average Annual Peak Temperature
  // ============================================

  async fetchHeatRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude ||
        typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return { available: false, level: 0, description: 'Location data unavailable' };
    }

    try {
      const point = encodeURIComponent(`POINT(${propertyData.longitude} ${propertyData.latitude})`);
      const { start, end } = CLIMATE_CONSTANTS.MID_CENTURY;
      // stat=max, freq=YS: response rows are [min, mean, max, std, count] per year.
      // index [2] = annual maximum daily temperature (hottest day of the year), in °F.
      const url = `${this.CAL_ADAPT_BASE_URL}/series/${CLIMATE_CONSTANTS.SLUGS.TASMAX}/events/?g=${point}&stat=max&freq=YS&start=${start}&end=${end}&imperial=True`;

      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`Cal-Adapt API returned ${response.status}`);

      const result = await response.json();
      if (!result.data || !result.data.length) throw new Error('No temperature data returned');

      let total = 0, count = 0;
      result.data.forEach(row => {
        if (Array.isArray(row) && row[2] != null) { total += row[2]; count++; }
      });
      if (count === 0) throw new Error('Unable to calculate temperature statistics');

      return this.classifyHeatRisk(total / count);

    } catch (error) {
      this.logError('☀️', 'Error fetching heat risk', error);
      return {
        available: false, level: 0,
        description: 'Data unavailable',
        details: 'Unable to retrieve extreme heat data at this time. Please try again later.'
      };
    }
  },

  classifyHeatRisk(avgMaxTempF) {
    const t = Math.round(avgMaxTempF);
    let level, description, details;

    if (avgMaxTempF < 95) {
      level = 0; description = 'Minimal';
      details = `Projected average annual peak temperature of ${t}°F by mid-century (2050–2060). Moderate summer heat expected.`;
    } else if (avgMaxTempF < 100) {
      level = 1; description = 'Low';
      details = `Projected average annual peak temperature of ${t}°F by mid-century (2050–2060). Hot summers expected — adequate cooling recommended.`;
    } else if (avgMaxTempF < 105) {
      level = 2; description = 'Moderate';
      details = `Projected average annual peak temperature of ${t}°F by mid-century (2050–2060). Very hot summers expected — reliable air conditioning essential.`;
    } else if (avgMaxTempF < 110) {
      level = 3; description = 'High';
      details = `Projected average annual peak temperature of ${t}°F by mid-century (2050–2060). Extreme heat expected regularly — significant cooling infrastructure needed.`;
    } else {
      level = 4; description = 'Severe';
      details = `Projected average annual peak temperature of ${t}°F by mid-century (2050–2060). Dangerous heat levels expected — may impact habitability during summer months.`;
    }

    return { available: true, level, description, details, rawData: { avgMaxTempF: t } };
  },

  // ============================================
  // EXTREME HEAT DAYS — Days Above 95°F (direct daily count from Cal-Adapt)
  // ============================================

  async fetchExtremeHeatDays(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude ||
        typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return { available: false, level: 0, description: 'Location data unavailable' };
    }

    try {
      // No freq or stat parameters — returns individual daily values in °F.
      // Response: { "index": ["2050-01-01T00:00:00Z", ...], "data": [60.1, 61.4, ...] }
      const point = encodeURIComponent(`POINT(${propertyData.longitude} ${propertyData.latitude})`);
      const { start, end } = CLIMATE_CONSTANTS.MID_CENTURY;
      const url = `${this.CAL_ADAPT_BASE_URL}/series/${CLIMATE_CONSTANTS.SLUGS.TASMAX}/events/?g=${point}&start=${start}&end=${end}&imperial=True`;

      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`Cal-Adapt API returned ${response.status}`);

      const result = await response.json();
      if (!result.data || !result.data.length || !result.index || !result.index.length) {
        throw new Error('No daily temperature data returned');
      }

      // Count days above 95°F directly from the daily values.
      const daysAbove95 = result.data.filter(v => v > 95.0).length;

      // Derive year count from index timestamps rather than hardcoding 11,
      // which guards against partial API responses.
      const uniqueYears = new Set(result.index.map(ts => String(ts).substring(0, 4))).size;
      const avgDaysPerYear = uniqueYears > 0 ? daysAbove95 / uniqueYears : 0;

      this.debug(`Heat days: ${daysAbove95} total over ${uniqueYears} yrs = ${avgDaysPerYear.toFixed(1)}/yr`);

      return this.classifyExtremeHeatDays(avgDaysPerYear);

    } catch (error) {
      this.logError('🔆', 'Error fetching extreme heat days', error);
      return {
        available: false, level: 0,
        description: 'Data unavailable',
        details: 'Unable to retrieve extreme heat data at this time. Please try again later.'
      };
    }
  },

  classifyExtremeHeatDays(avgDaysPerYear) {
    const days = Math.round(avgDaysPerYear);
    let level, description, details;

    if (days < 10) {
      level = 0; description = 'Minimal';
      details = `Cal-Adapt projects approximately ${days} days per year above 95°F by mid-century (2050–2060). Minimal extreme heat exposure.`;
    } else if (days < 30) {
      level = 1; description = 'Low';
      details = `Cal-Adapt projects approximately ${days} days per year above 95°F by mid-century (2050–2060). Some extreme heat days expected — adequate cooling recommended.`;
    } else if (days < 60) {
      level = 2; description = 'Moderate';
      details = `Cal-Adapt projects approximately ${days} days per year above 95°F by mid-century (2050–2060). Frequent extreme heat — reliable air conditioning essential.`;
    } else if (days < 90) {
      level = 3; description = 'High';
      details = `Cal-Adapt projects approximately ${days} days per year above 95°F by mid-century (2050–2060). Nearly a full season above 95°F — health risks, energy demand, and outdoor impacts are significant.`;
    } else {
      level = 4; description = 'Severe';
      details = `Cal-Adapt projects approximately ${days} days per year above 95°F by mid-century (2050–2060). Prolonged dangerous heat for months at a time — may significantly impact habitability.`;
    }

    return { available: true, level, description, details, rawData: { avgDaysAbove95F: days } };
  },

  // ============================================
  // EXTREME PRECIPITATION — Days exceeding local historical 95th percentile
  // ============================================
  // Methodology:
  //   1. Fetch historical daily series (1981–2010) → derive the 95th percentile of
  //      wet days (>= 0.1 mm/day) as a location-specific extreme threshold.
  //   2. Fetch mid-century daily series (2050–2060) → count days exceeding that threshold.
  //   3. Average by number of years in response to get days/year.
  // This is area-relative: what counts as "extreme" for a desert location is
  // defined by that location's own precipitation distribution, not a global cutoff.

  async fetchExtremePrecipitationRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude ||
        typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return { available: false, level: 0, description: 'Location data unavailable' };
    }

    try {
      const point = encodeURIComponent(`POINT(${propertyData.longitude} ${propertyData.latitude})`);
      const { start: futStart, end: futEnd } = CLIMATE_CONSTANTS.MID_CENTURY;
      const { start: histStart, end: histEnd } = CLIMATE_CONSTANTS.HISTORICAL;

      // Fetch historical baseline and mid-century projection in parallel.
      // Both return flat daily kg/m²/s values (no freq/stat params).
      const [histResp, futResp] = await Promise.all([
        fetch(`${this.CAL_ADAPT_BASE_URL}/series/${CLIMATE_CONSTANTS.SLUGS.PRECIP_HIST}/events/?g=${point}&start=${histStart}&end=${histEnd}`, { headers: { 'Accept': 'application/json' } }),
        fetch(`${this.CAL_ADAPT_BASE_URL}/series/${CLIMATE_CONSTANTS.SLUGS.PRECIP}/events/?g=${point}&start=${futStart}&end=${futEnd}`, { headers: { 'Accept': 'application/json' } })
      ]);

      if (!histResp.ok) throw new Error(`Cal-Adapt historical API returned ${histResp.status}`);
      if (!futResp.ok)  throw new Error(`Cal-Adapt future API returned ${futResp.status}`);

      const [histResult, futResult] = await Promise.all([histResp.json(), futResp.json()]);

      if (!histResult.data || !histResult.data.length) throw new Error('No historical precipitation data');
      if (!futResult.data  || !futResult.data.length)  throw new Error('No future precipitation data');

      // Convert kg/m²/s → mm/day (× 86400). Filter to wet days (≥ 0.1 mm/day).
      const toMmDay = v => v * 86400;
      const WET_DAY_MM = 0.1;

      const histWetDays = histResult.data
        .filter(v => v != null)
        .map(toMmDay)
        .filter(v => v >= WET_DAY_MM)
        .sort((a, b) => a - b);

      if (!histWetDays.length) throw new Error('No wet days in historical data');

      // 95th percentile of historical wet-day distribution = local extreme threshold
      const p95idx = Math.floor(histWetDays.length * 0.95);
      const thresholdMmDay = histWetDays[Math.min(p95idx, histWetDays.length - 1)];
      const thresholdInDay = thresholdMmDay / 25.4;

      // Count mid-century days exceeding local threshold
      const futDaysAbove = futResult.data
        .filter(v => v != null)
        .map(toMmDay)
        .filter(v => v > thresholdMmDay).length;

      const futYears = new Set(
        (futResult.index || []).map(ts => String(ts).substring(0, 4))
      ).size || 11;

      const avgDaysPerYear = futDaysAbove / futYears;

      return this.classifyExtremePrecipitation(avgDaysPerYear, thresholdInDay);

    } catch (error) {
      this.logError('🌧️', 'Error fetching extreme precipitation risk', error);
      return {
        available: false, level: 0,
        description: 'Data unavailable',
        details: 'Unable to retrieve precipitation data at this time. Please try again later.'
      };
    }
  },

  classifyExtremePrecipitation(avgDaysPerYear, thresholdInDay) {
    const days = Math.round(avgDaysPerYear);
    const thresh = thresholdInDay.toFixed(2);
    let level, description, details;

    // Thresholds: days/year exceeding the local historical 95th percentile wet-day intensity.
    // A higher count means extreme events are becoming more frequent relative to the baseline.
    if (days < 5) {
      level = 0; description = 'Minimal';
      details = `Cal-Adapt projects approximately ${days} days/year above the local extreme precipitation threshold (${thresh} in/day — historical 95th percentile for this area) by mid-century. Minimal increase in heavy precipitation days relative to the historical baseline.`;
    } else if (days < 12) {
      level = 1; description = 'Low';
      details = `Cal-Adapt projects approximately ${days} days/year above the local extreme precipitation threshold (${thresh} in/day) by mid-century. Some increase in heavy precipitation days — storm drainage and runoff management remain routine concerns.`;
    } else if (days < 20) {
      level = 2; description = 'Moderate';
      details = `Cal-Adapt projects approximately ${days} days/year above the local extreme precipitation threshold (${thresh} in/day) by mid-century. Moderate increase in heavy precipitation days — elevated risk of localized flooding, erosion, and drainage stress.`;
    } else if (days < 30) {
      level = 3; description = 'High';
      details = `Cal-Adapt projects approximately ${days} days/year above the local extreme precipitation threshold (${thresh} in/day) by mid-century. High frequency of heavy precipitation events — significant flood, runoff, and infrastructure risk during wet seasons.`;
    } else {
      level = 4; description = 'Severe';
      details = `Cal-Adapt projects approximately ${days} days/year above the local extreme precipitation threshold (${thresh} in/day) by mid-century. Severe increase in extreme precipitation frequency — among the highest projected in California. Serious flooding and erosion risk.`;
    }

    return { available: true, level, description, details, rawData: { avgDaysPerYear: days, thresholdInDay: thresh } };
  },

  // ============================================
  // SEA LEVEL RISE
  // ============================================

  async fetchSeaLevelRiseRisk(propertyData) {
    if (!propertyData.latitude || !propertyData.longitude ||
        typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return { available: false, level: 0, description: 'Location data unavailable' };
    }

    if (!this.isNearCaliforniaCoast(propertyData.latitude, propertyData.longitude)) {
      return {
        available: true, level: 0,
        description: 'Not applicable',
        details: 'Property is not in a coastal zone.'
      };
    }

    // Fetch elevation from USGS 3DEP Elevation Point Query Service.
    // Falls back gracefully if unavailable — coastal warning still shown.
    let elevationFt = null;
    try {
      const elevUrl = `https://epqs.nationalmap.gov/v1/json?x=${propertyData.longitude}&y=${propertyData.latitude}&wkid=4326&includeDate=false`;
      const elevResponse = await fetch(elevUrl, { headers: { 'Accept': 'application/json' } });
      if (elevResponse.ok) {
        const elevData = await elevResponse.json();
        // Response: { value: "12.34" } in meters
        const meters = parseFloat(elevData.value);
        if (!isNaN(meters)) elevationFt = meters * 3.28084;
      }
    } catch (_) {
      // Non-fatal — proceed without elevation data
    }

    return this.classifySeaLevelRise(elevationFt);
  },

  classifySeaLevelRise(elevationFt) {
    const LOW_ELEV_THRESHOLD_FT = 15;

    if (elevationFt === null) {
      // Elevation lookup failed — give combined warning covering both inundation and cliff erosion
      return {
        available: true, level: 1,
        description: 'Verify risk',
        details: "This property is in a coastal area. California projects 0.6–1.5 ft of sea level rise by 2050 and up to 3.5 ft by 2100 (NOAA 2022). Low-elevation properties face direct inundation risk. Elevated coastal properties (e.g., cliff-top locations) remain vulnerable to accelerating cliff retreat and erosion driven by sea level rise and wave action — elevation alone does not eliminate risk. Check NOAA's Sea Level Rise Viewer and the California Coastal Commission's Hazard Maps for site-specific assessment.",
        rawData: { elevationFt: null }
      };
    }

    const elevStr = Math.round(elevationFt);

    if (elevationFt <= LOW_ELEV_THRESHOLD_FT) {
      // Low elevation — inundation risk is primary concern
      const level = elevationFt <= 5 ? 3 : elevationFt <= 10 ? 2 : 1;
      const desc  = level === 3 ? 'High' : level === 2 ? 'Moderate' : 'Low';
      return {
        available: true, level, description: desc,
        details: `Property elevation is approximately ${elevStr} ft above sea level. California projects 0.6–1.5 ft of sea level rise by 2050 and up to 3.5 ft by 2100 under high scenarios (NOAA 2022). At this elevation, direct inundation, increased tidal flooding, and storm surge risk are significant concerns. Check NOAA's Sea Level Rise Viewer for site-specific inundation scenarios.`,
        rawData: { elevationFt: elevStr }
      };
    } else {
      // Higher elevation — cliff erosion and coastal bluff retreat are the primary concern
      return {
        available: true, level: 1,
        description: 'Verify risk',
        details: `Property elevation is approximately ${elevStr} ft above sea level. While direct inundation risk is lower at this elevation, coastal properties at any height remain vulnerable to cliff retreat and bluff erosion accelerated by sea level rise, wave action, and storm events. Elevation does not eliminate sea level rise risk for properties near coastal bluffs. Check the California Coastal Commission's Coastal Hazards Maps and NOAA's Sea Level Rise Viewer for site-specific erosion and inundation assessments.`,
        rawData: { elevationFt: elevStr }
      };
    }
  },

  isNearCaliforniaCoast(lat, lon) {
    // Seven coastal regions covering the California shoreline (~10 miles inland).
    // Validated against NOAA coastal zone boundaries.
    const regions = [
      { latMin: 41.0, latMax: 42.1, lonMin: -124.5, lonMax: -123.9 }, // Del Norte / Humboldt
      { latMin: 38.7, latMax: 41.0, lonMin: -124.2, lonMax: -123.5 }, // Mendocino / Sonoma
      { latMin: 37.4, latMax: 38.7, lonMin: -122.8, lonMax: -122.3 }, // Marin / SF / San Mateo
      { latMin: 35.9, latMax: 37.4, lonMin: -122.2, lonMax: -121.4 }, // Santa Cruz / Monterey
      { latMin: 34.3, latMax: 35.9, lonMin: -121.0, lonMax: -119.8 }, // SLO / Santa Barbara
      { latMin: 33.7, latMax: 34.3, lonMin: -119.8, lonMax: -118.2 }, // Ventura / LA
      { latMin: 32.5, latMax: 33.7, lonMin: -118.2, lonMax: -117.1 }  // Orange / San Diego
    ];
    return regions.some(r =>
      lat >= r.latMin && lat <= r.latMax && lon >= r.lonMin && lon <= r.lonMax
    );
  }
};
