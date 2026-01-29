const ClimateCache = {
  // PRIORITY 1 FIX: Added version to cache key
  CACHE_PREFIX: 'climate_risk_v2_',
  CACHE_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
  
  async get(address) {
    // PRIORITY 1 FIX: Added input validation
    if (!address || typeof address !== 'string') {
      console.warn('🌡️ Cache.get: Invalid address');
      return null;
    }
    
    const key = this.CACHE_PREFIX + this.hashAddress(address);
    
    try {
      const result = await chrome.storage.local.get(key);
      
      if (result[key]) {
        const cached = result[key];
        const now = Date.now();
        
        // PRIORITY 1 FIX: Validate cache structure
        if (!cached.data || !cached.timestamp) {
          console.warn('🌡️ Cache: Invalid structure, removing');
          await this.remove(address);
          return null;
        }
        
        // PRIORITY 1 FIX: Check cache version
        if (cached.version && cached.version !== 2) {
          console.log('🌡️ Cache: Old version detected, removing');
          await this.remove(address);
          return null;
        }
        
        if (now - cached.timestamp < this.CACHE_DURATION) {
          return cached.data;
        } else {
          await this.remove(address);
        }
      }
    } catch (error) {
      console.error('🌡️ Error reading from cache:', error);
    }
    
    return null;
  },
  
  async set(address, data) {
    // PRIORITY 1 FIX: Added input validation
    if (!address || typeof address !== 'string') {
      console.warn('🌡️ Cache.set: Invalid address');
      return false;
    }
    
    if (!data || typeof data !== 'object') {
      console.warn('🌡️ Cache.set: Invalid data');
      return false;
    }
    
    const key = this.CACHE_PREFIX + this.hashAddress(address);
    
    try {
      await chrome.storage.local.set({
        [key]: {
          data: data,
          timestamp: Date.now(),
          version: 2 // PRIORITY 1 FIX: Added version field
        }
      });
      return true;
    } catch (error) {
      console.error('🌡️ Error writing to cache:', error);
      return false;
    }
  },
  
  async remove(address) {
    if (!address) return false;
    
    const key = this.CACHE_PREFIX + this.hashAddress(address);
    
    try {
      await chrome.storage.local.remove(key);
      return true;
    } catch (error) {
      console.error('🌡️ Error removing from cache:', error);
      return false;
    }
  },
  
  // PRIORITY 1 FIX: Improved hash function
  hashAddress(address) {
    // Normalize address first
    const normalized = address.toLowerCase().trim().replace(/\s+/g, ' ');
    
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Return as hex string, padded to 8 characters
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
};