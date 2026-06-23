// ============================================
// CLIMATE DATA FETCHER
// ============================================
// v4.0 Changes (CMIP6 migration):
//   - Heat, extreme heat days, precipitation, sea level rise, and FEMA NRI now
//     come from the Climateshed CMIP6 microservice via a Cloudflare-Worker proxy
//     (single /point/all request). LOCA2 CMIP6, 5-model ensemble, SSP3-7.0,
//     2050–2059. Replaces the per-variable Cal-Adapt CMIP5 (HadGEM2-ES RCP8.5)
//     queries and the bbox + USGS-elevation sea-level-rise heuristic.
//   - Precipitation card is now "% change in annual total vs 1981–2010" (the
//     microservice metric); range shown is the p10–p90 ensemble spread.
//   - NEW: FEMA National Risk Index multi-hazard section (earthquake, landslide,
//     inland flooding, extreme heat, …).
//   - Wildfire (current FHSZ), flood (current + FC-FIRM projected), and the
//     wildfire 2050 probability (Cal-Adapt fireprob) are unchanged and still
//     queried directly from their public APIs.
// ============================================

// Cloudflare-Worker proxy in front of the CMIP6 microservice (ca-climate-cmip6.fly.dev).
// The proxy holds the upstream X-API-Key and sets CORS for the extension.
// Deploy with climate-proxy/ then replace the placeholder subdomain below.
const CLIMATE_PROXY_URL = 'https://climateshed-cmip6-proxy.neil-matouka.workers.dev/climate';

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

  // Cal-Adapt decadal wildfire probability (UC Merced). Still queried directly —
  // the CMIP6 microservice does not expose a wildfire-projection endpoint.
  SLUGS: {
    FIRE_PROB: 'fireprob_10y_HadGEM2-ES_rcp85_bau'
  }
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

  unavailable(description, details) {
    return { available: false, level: 0, description: description || 'Data unavailable', details };
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
      extremePrecipitation: null,
      nri: null
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
        climateshed
      ] = await Promise.allSettled([
        this.withTimeout(this.fetchWildfireRisk(propertyData), 10000, 'Wildfire'),
        this.withTimeout(this.fetchWildfireProjection(propertyData), 15000, 'WildfireProjection'),
        this.withTimeout(this.fetchFloodRisks(propertyData), 15000, 'Flood'),
        this.withTimeout(this.fetchClimateshedData(propertyData), 20000, 'Climateshed')
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

      // The Climateshed proxy call returns all of its sub-results pre-classified
      // (each independently marked unavailable on partial failure), so it never
      // rejects in practice — but guard the rejected case anyway.
      if (climateshed.status === 'fulfilled') {
        const c = climateshed.value;
        results.heat = c.heat;
        results.extremeHeatDays = c.extremeHeatDays;
        results.extremePrecipitation = c.extremePrecipitation;
        results.seaLevelRise = c.seaLevelRise;
        results.nri = c.nri;
      } else {
        this.logError('🌡️', 'Climateshed fetch failed', climateshed.reason);
      }

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
        details: 'No Fire Hazard Severity Zone (FHSZ) designation applies to this location under CAL FIRE mapping. This is a regulatory classification, not a fire risk assessment — urban and suburban areas are frequently unzoned even when adjacent to wildland interface. Check with your local fire department or use the CAL FIRE FHSZ viewer for complete local mapping.'
      };
    }

    return this.classifyWildfireRisk(best.HAZ_CLASS, best.HAZ_CODE);
  },

  classifyWildfireRisk(hazClass, hazCode) {
    let level, description, details;

    if (!hazClass || hazClass === 'Non-Wildland/Non-Urban') {
      level = 0; description = 'Minimal';
      details = 'No Fire Hazard Severity Zone (FHSZ) designation applies to this location under CAL FIRE mapping. This is a regulatory classification, not a fire risk assessment — urban and suburban areas are frequently unzoned even when adjacent to wildland interface.';
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
  // CLIMATESHED CMIP6 — Heat, Heat Days, Precip, Sea Level Rise, FEMA NRI
  // ============================================
  // One request to the Cloudflare-Worker proxy → microservice /point/all.
  // Each sub-result is classified independently and degrades to "unavailable"
  // rather than failing the whole batch.

  async fetchClimateshedData(propertyData) {
    const failAll = (msg) => ({
      heat: this.unavailable('Data unavailable', msg),
      extremeHeatDays: this.unavailable('Data unavailable', msg),
      extremePrecipitation: this.unavailable('Data unavailable', msg),
      seaLevelRise: this.unavailable('Data unavailable', msg),
      nri: this.unavailable('Data unavailable', msg)
    });

    if (!propertyData.latitude || !propertyData.longitude ||
        typeof propertyData.latitude !== 'number' || typeof propertyData.longitude !== 'number') {
      return failAll('Location coordinates unavailable.');
    }

    let data;
    try {
      const url = `${CLIMATE_PROXY_URL}?lat=${propertyData.latitude}&lon=${propertyData.longitude}`;
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`Climate proxy returned ${response.status}`);
      data = await response.json();
    } catch (error) {
      this.logError('🌡️', 'Error fetching Climateshed data', error);
      return failAll('Unable to retrieve climate projection data at this time. Please try again later.');
    }

    const climate = data.climate || null;
    const place = climate && climate.nearest_place ? climate.nearest_place : null;
    const nModels = climate && climate.models_used ? climate.models_used : 5;

    return {
      heat: climate
        ? this.classifyHeat(climate.tasmax, nModels)
        : this.unavailable('Data unavailable', 'No temperature projection available for this location.'),
      extremeHeatDays: climate
        ? this.classifyHeatDays(climate.extreme_heat_days, nModels)
        : this.unavailable('Data unavailable', 'No extreme-heat-days projection available for this location.'),
      extremePrecipitation: climate
        ? this.classifyPrecipChange(climate.precip_change_pct, nModels)
        : this.unavailable('Data unavailable', 'No precipitation projection available for this location.'),
      seaLevelRise: this.classifySeaLevelRise(data.slr || null),
      nri: this.classifyNRI(data.nri || null, place)
    };
  },

  // ---- Extreme heat (avg annual peak temperature, °F) ----
  classifyHeat(tasmax, nModels) {
    if (!tasmax || tasmax.median == null) {
      return this.unavailable('Data unavailable', 'No temperature projection available for this location.');
    }
    const t = Math.round(tasmax.median);
    const range = (tasmax.p10 != null && tasmax.p90 != null)
      ? ` (${Math.round(tasmax.p10)}–${Math.round(tasmax.p90)}°F across ${nModels} models)` : '';
    let level, description;

    if (tasmax.median < 95)       { level = 0; description = 'Minimal'; }
    else if (tasmax.median < 100) { level = 1; description = 'Low'; }
    else if (tasmax.median < 105) { level = 2; description = 'Moderate'; }
    else if (tasmax.median < 110) { level = 3; description = 'High'; }
    else                          { level = 4; description = 'Severe'; }

    const tail = [
      'Moderate summer heat expected.',
      'Hot summers expected — adequate cooling recommended.',
      'Very hot summers expected — reliable air conditioning essential.',
      'Extreme heat expected regularly — significant cooling infrastructure needed.',
      'Dangerous heat levels expected — may impact habitability during summer months.'
    ][level];

    const details = `Projected average annual peak temperature of ${t}°F${range} by mid-century (2050–2060), LOCA2 CMIP6 ensemble under SSP3-7.0 (high emissions). ${tail}`;
    return { available: true, level, description, details, rawData: { ...tasmax } };
  },

  // ---- Extreme heat days (days/yr above local historical 95th-pct threshold) ----
  classifyHeatDays(ehd, nModels) {
    if (!ehd || ehd.median == null) {
      return this.unavailable('Data unavailable', 'No extreme-heat-days projection available for this location.');
    }
    const days = Math.round(ehd.median);
    const range = (ehd.p10 != null && ehd.p90 != null)
      ? ` (${Math.round(ehd.p10)}–${Math.round(ehd.p90)} across ${nModels} models)` : '';
    const thresh = ehd.threshold_f != null ? `${Math.round(ehd.threshold_f)}°F` : 'the local threshold';
    let level, description;

    // Baseline expectation: ~18 days/year (5% of 365) exceeded the threshold historically.
    if (ehd.median < 18)      { level = 0; description = 'Minimal'; }
    else if (ehd.median < 30) { level = 1; description = 'Low'; }
    else if (ehd.median < 55) { level = 2; description = 'Moderate'; }
    else if (ehd.median < 80) { level = 3; description = 'High'; }
    else                      { level = 4; description = 'Severe'; }

    const details = `LOCA2 CMIP6 ensemble projects approximately ${days} days/year${range} above the local historical 95th-percentile temperature (${thresh}) by mid-century (2050–2059, SSP3-7.0) — versus a historical baseline of ~18 days/year. Temperatures that were historically rare become routine.`;
    return { available: true, level, description, details, rawData: { ...ehd } };
  },

  // ---- Precipitation change (% change in annual total vs 1981–2010) ----
  // California's mean-precipitation direction under climate change is genuinely
  // uncertain (the ensemble p10–p90 often straddles zero); the robust signal is
  // increased volatility. We classify by the MAGNITUDE of projected change and
  // describe its direction (wetter → runoff/flood, drier → drought stress).
  classifyPrecipChange(pc, nModels) {
    if (!pc || pc.median == null) {
      return this.unavailable('Data unavailable', 'No precipitation projection available for this location.');
    }
    const pct = pc.median;
    const mag = Math.abs(pct);
    const sign = pct >= 0 ? '+' : '−';
    const dir = pct >= 0 ? 'wetter' : 'drier';
    const range = (pc.p10 != null && pc.p90 != null)
      ? ` (${pc.p10 > 0 ? '+' : ''}${Math.round(pc.p10)}% to ${pc.p90 > 0 ? '+' : ''}${Math.round(pc.p90)}% across ${nModels} models)` : '';
    let level, description;

    if (mag < 2)       { level = 0; description = 'Minimal'; }
    else if (mag < 5)  { level = 1; description = 'Low'; }
    else if (mag < 10) { level = 2; description = 'Moderate'; }
    else if (mag < 20) { level = 3; description = 'High'; }
    else               { level = 4; description = 'Severe'; }

    const consequence = pct >= 0
      ? 'A wetter annual mean raises runoff, drainage, and flood potential, and is typically delivered as more-intense storms.'
      : 'A drier annual mean raises drought, water-supply, and wildfire-fuel stress.';
    const uncertainty = (pc.p10 != null && pc.p90 != null && pc.p10 < 0 && pc.p90 > 0)
      ? ' Note: the ensemble spans both drier and wetter outcomes, so the direction is uncertain — the more robust signal is increased year-to-year volatility.' : '';

    const details = `LOCA2 CMIP6 ensemble projects a ${sign}${Math.round(mag)}% change in average annual precipitation${range} by mid-century (2050–2059 vs 1981–2010, SSP3-7.0) — ${dir}. ${consequence}${uncertainty}`;
    return { available: true, level, description, details, rawData: { ...pc } };
  },

  // ---- Sea level rise (NOAA NOS TR 01 2022 / OPC 2024, nearest CA tide gauge) ----
  // The microservice returns regional gauge projections (not property elevation),
  // so this card is informational/verify rather than a property-specific inundation call.
  classifySeaLevelRise(slr) {
    if (!slr) {
      return {
        available: true, level: 0, description: 'Not applicable',
        details: 'Property is not in a coastal zone (more than ~100 km from the nearest California tide gauge).'
      };
    }

    const ft2050 = slr.intermediate_ft_2050;
    const ft2100 = slr.intermediate_ft_2100;
    const highFt2100 = slr.scenarios && slr.scenarios.high && slr.scenarios.high.ft
      ? slr.scenarios.high.ft['2100'] : null;
    const gauge = slr.nearest_point || 'the nearest California tide gauge';
    const dist = slr.dist_km != null ? `${slr.dist_km} km away` : 'nearby';

    // Regional magnitude (intermediate scenario, 2100) as a coarse severity signal.
    let level, description;
    if (ft2100 == null)      { level = 1; description = 'Verify risk'; }
    else if (ft2100 < 3)     { level = 1; description = 'Low'; }
    else if (ft2100 < 5)     { level = 2; description = 'Moderate'; }
    else if (ft2100 < 7)     { level = 3; description = 'High'; }
    else                     { level = 4; description = 'Severe'; }

    const figures = (ft2050 != null && ft2100 != null)
      ? `approximately ${ft2050} ft by 2050 and ${ft2100} ft by 2100 under the intermediate scenario`
      : 'rising through this century';
    const highTail = highFt2100 != null ? ` (up to ~${highFt2100} ft by 2100 under the high scenario)` : '';

    const details = `This property is in a coastal zone. Based on ${gauge} (${dist}), NOAA projects ${figures}${highTail} — the OPC 2024 California planning standard. These are regional projections, not a property-specific elevation assessment: low-lying parcels face direct inundation and storm-surge risk, while elevated coastal parcels remain exposed to accelerating cliff and bluff erosion. Check NOAA's Sea Level Rise Viewer and the California Coastal Commission hazard maps for site-specific assessment.`;
    return { available: true, level, description, details, rawData: { nearest_point: slr.nearest_point, intermediate_ft_2050: ft2050, intermediate_ft_2100: ft2100, high_ft_2100: highFt2100 } };
  },

  // ---- FEMA National Risk Index (multi-hazard, census tract) ----
  // Returns a section-shaped result: overall + sorted hazard rows. Ratings map
  // to the same 0–4 colour scale used elsewhere.
  NRI_RATING_LEVEL: {
    'Very Low': 0,
    'Relatively Low': 1,
    'Relatively Moderate': 2,
    'Relatively High': 3,
    'Very High': 4
  },

  classifyNRI(nri, place) {
    if (!nri || !nri.overall) {
      return this.unavailable('Not available', 'FEMA National Risk Index data is not available for this location (it may be outside the mapped census-tract dataset).');
    }

    const overallRating = nri.overall.risk_rating;
    const overallLevel = this.NRI_RATING_LEVEL[overallRating];

    const hazards = Object.values(nri.hazards || {})
      .map(h => ({
        name: h.hazard,
        rating: h.risk_rating,
        pctile: h.risk_score_pctile,
        level: this.NRI_RATING_LEVEL[h.risk_rating]
      }))
      .filter(h => h.level != null)
      .sort((a, b) => (b.level - a.level) || ((b.pctile ?? 0) - (a.pctile ?? 0)));

    const where = nri.county ? `${nri.county}, ${nri.state_abbr || ''}`.trim().replace(/,\s*$/, '') : (place || 'this census tract');

    return {
      available: true,
      level: overallLevel != null ? overallLevel : 0,
      description: overallRating || 'See breakdown',
      overall: {
        rating: overallRating,
        pctile: nri.overall.risk_score_pctile,
        level: overallLevel
      },
      socialVulnerability: nri.social_vulnerability ? nri.social_vulnerability.rating : null,
      communityResilience: nri.community_resilience ? nri.community_resilience.rating : null,
      hazards,
      details: `FEMA National Risk Index for ${where} (Dec 2025 v1.20). Overall risk: ${overallRating || 'n/a'}${nri.overall.risk_score_pctile != null ? ` (${Math.round(nri.overall.risk_score_pctile)}th percentile nationally)` : ''}. Percentiles compare this tract against all U.S. census tracts; the index includes non-climate hazards such as earthquake and landslide.`,
      rawData: { tract_fips: nri.tract_fips }
    };
  }
};
