const ClimateCache = {
  CACHE_PREFIX: 'climate_risk_v2_',
  CACHE_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
  
  async get(address) {
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
        
        if (!cached.data || !cached.timestamp) {
          console.warn('🌡️ Cache: Invalid structure, removing');
          await this.remove(address);
          return null;
        }
        
        if (cached.version && cached.version !== 2) {
          console.log('🌡️ Cache: Old version detected, removing');
          await this.remove(address);
          return null;
        }
        
        if (now - cached.timestamp < this.CACHE_DURATION) {
          // PRIORITY 2 FIX: Log cache age for debugging
          const ageHours = ((now - cached.timestamp) / (1000 * 60 * 60)).toFixed(1);
          console.log(`🌡️ Cache HIT (${ageHours}h old)`);
          return cached.data;
        } else {
          console.log('🌡️ Cache EXPIRED');
          await this.remove(address);
        }
      }
    } catch (error) {
      console.error('🌡️ Error reading from cache:', error);
    }
    
    return null;
  },
  
  async set(address, data) {
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
          version: 2,
          // PRIORITY 2 FIX: Store original address for debugging
          _debug_address: address
        }
      });
      console.log('🌡️ Cache SET:', address);
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
      console.log('🌡️ Cache REMOVE:', address);
      return true;
    } catch (error) {
      console.error('🌡️ Error removing from cache:', error);
      return false;
    }
  },
  
  // PRIORITY 2 FIX: Enhanced hash function with better normalization
  hashAddress(address) {
    // More aggressive normalization for better cache hits
    let normalized = address
      .toLowerCase()                    // Lowercase
      .trim()                           // Remove leading/trailing spaces
      .replace(/\s+/g, ' ')            // Normalize multiple spaces to single
      .replace(/\./g, '')              // Remove periods
      .replace(/,\s*/g, ', ')          // Normalize comma spacing
      .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct)\b/gi, ''); // Remove street type variations
    
    // Remove common suffixes that might vary
    normalized = normalized
      .replace(/\s+ca\s+\d{5}$/i, '')  // Remove " CA 12345" at end
      .replace(/\s+california\b/i, '') // Remove "California"
      .trim();
    
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    // Return as hex string with padding for consistency
    return Math.abs(hash).toString(16).padStart(8, '0');
  },
  
  // PRIORITY 2 FIX: New helper to get cache statistics
  async getStats() {
    try {
      const items = await chrome.storage.local.get(null);
      const cacheKeys = Object.keys(items).filter(key => 
        key.startsWith(this.CACHE_PREFIX)
      );
      
      let totalSize = 0;
      let expiredCount = 0;
      const now = Date.now();
      
      for (const key of cacheKeys) {
        const item = items[key];
        totalSize += JSON.stringify(item).length;
        
        if (item.timestamp && (now - item.timestamp >= this.CACHE_DURATION)) {
          expiredCount++;
        }
      }
      
      return {
        totalEntries: cacheKeys.length,
        expiredEntries: expiredCount,
        estimatedSizeBytes: totalSize,
        estimatedSizeKB: (totalSize / 1024).toFixed(2),
        version: 2
      };
    } catch (error) {
      console.error('🌡️ Error getting cache stats:', error);
      return {
        totalEntries: 0,
        expiredEntries: 0,
        estimatedSizeBytes: 0,
        estimatedSizeKB: '0',
        version: 2
      };
    }
  },
  
  // PRIORITY 2 FIX: New helper to cleanup expired entries
  async cleanup() {
    try {
      const items = await chrome.storage.local.get(null);
      const now = Date.now();
      const keysToRemove = [];
      
      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith(this.CACHE_PREFIX)) {
          // Remove if expired
          if (value.timestamp && (now - value.timestamp >= this.CACHE_DURATION)) {
            keysToRemove.push(key);
          }
          // Remove if invalid structure
          else if (!value.data || !value.timestamp) {
            keysToRemove.push(key);
          }
          // Remove if wrong version
          else if (value.version !== 2) {
            keysToRemove.push(key);
          }
        }
      }
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`🌡️ Cache cleanup: removed ${keysToRemove.length} entries`);
      }
      
      return keysToRemove.length;
    } catch (error) {
      console.error('🌡️ Error during cache cleanup:', error);
      return 0;
    }
  }
};