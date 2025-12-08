let lastCallMap: Record<string, number> = {};

export function rateLimitedFetch(url: string, limitMs = 2500, options?: RequestInit) {
  const now = Date.now();
  
  // Per-URL rate limiting only - removed global rate limiting as it was too aggressive
  // This allows different endpoints to be called in parallel
  const last = lastCallMap[url] || 0;
  if (now - last < limitMs) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Limiter] URL:', url, 'action:', 'skipped', 'timestamp:', now);
    }
    return Promise.resolve({ skipped: true });
  }

  lastCallMap[url] = now;
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[Limiter] URL:', url, 'action:', 'executed', 'timestamp:', now);
  }
  return fetch(url, options);
}

