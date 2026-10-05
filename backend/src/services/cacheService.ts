import NodeCache from 'node-cache';

// Cache instance with 5 minutes (300 seconds) standard TTL, and check period of 60 seconds
export const appCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Helper to get from cache or execute a promise and cache the result
 */
export async function getOrSetCache<T>(key: string, fetchFn: () => Promise<T>, ttl: number = 300): Promise<T> {
  const cached = appCache.get<T>(key);
  if (cached !== undefined) {
    return cached;
  }
  
  const result = await fetchFn();
  appCache.set(key, result, ttl);
  return result;
}
