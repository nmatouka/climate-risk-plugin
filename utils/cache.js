const ClimateCache = {
  CACHE_PREFIX: 'climate_risk_v3_',
  CACHE_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days
  CACHE_VERSION: 3,
  DEBUG: false,

  debug(...args) {
    if (this.DEBUG) console.log(...args);
  },

  async get(address) {
    if (!address || typeof address !== 'string') {
      return null;
    }

    const key = this.CACHE_PREFIX + this.hashAddress(address);

    try {
      const result = await chrome.storage.local.get(key);

      if (result[key]) {
        const cached = result[key];
        const now = Date.now();

        if (!cached.data || !cached.timestamp) {
          await this.remove(address);
          return null;
        }

        if (cached.version && cached.version !== this.CACHE_VERSION) {
          await this.remove(address);
          return null;
        }

        if (now - cached.timestamp < this.CACHE_DURATION) {
          this.debug('Cache HIT');
          return cached.data;
        } else {
          await this.remove(address);
        }
      }
    } catch (error) {
      this.debug('Error reading from cache:', error.message);
    }

    return null;
  },

  async set(address, data) {
    if (!address || typeof address !== 'string') {
      return false;
    }

    if (!data || typeof data !== 'object') {
      return false;
    }

    const key = this.CACHE_PREFIX + this.hashAddress(address);

    try {
      await chrome.storage.local.set({
        [key]: {
          data: data,
          timestamp: Date.now(),
          version: this.CACHE_VERSION
        }
      });
      return true;
    } catch (error) {
      this.debug('Error writing to cache:', error.message);
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
      this.debug('Error removing from cache:', error.message);
      return false;
    }
  },

  hashAddress(address) {
    let normalized = address
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\./g, '')
      .replace(/,\s*/g, ', ')
      .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct)\b/gi, '');

    normalized = normalized
      .replace(/\s+ca\s+\d{5}$/i, '')
      .replace(/\s+california\b/i, '')
      .trim();

    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(16).padStart(8, '0');
  },

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
        version: this.CACHE_VERSION
      };
    } catch (error) {
      return {
        totalEntries: 0,
        expiredEntries: 0,
        estimatedSizeBytes: 0,
        estimatedSizeKB: '0',
        version: this.CACHE_VERSION
      };
    }
  },

  async cleanup() {
    try {
      const items = await chrome.storage.local.get(null);
      const now = Date.now();
      const keysToRemove = [];

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith(this.CACHE_PREFIX)) {
          if (value.timestamp && (now - value.timestamp >= this.CACHE_DURATION)) {
            keysToRemove.push(key);
          } else if (!value.data || !value.timestamp) {
            keysToRemove.push(key);
          } else if (value.version !== this.CACHE_VERSION) {
            keysToRemove.push(key);
          }
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }

      return keysToRemove.length;
    } catch (error) {
      return 0;
    }
  }
};
