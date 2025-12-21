const ClimateCache = {
  CACHE_PREFIX: 'climate_risk_',
  CACHE_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
  
  async get(address) {
    const key = this.CACHE_PREFIX + this.hashAddress(address);
    
    try {
      const result = await chrome.storage.local.get(key);
      
      if (result[key]) {
        const cached = result[key];
        const now = Date.now();
        
        if (now - cached.timestamp < this.CACHE_DURATION) {
          return cached.data;
        } else {
          await this.remove(address);
        }
      }
    } catch (error) {
      console.error('Error reading from cache:', error);
    }
    
    return null;
  },
  
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
  
  async remove(address) {
    const key = this.CACHE_PREFIX + this.hashAddress(address);
    
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error('Error removing from cache:', error);
    }
  },
  
  hashAddress(address) {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      const char = address.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString();
  }
};