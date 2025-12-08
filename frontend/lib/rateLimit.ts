let lastCallMap: Record<string, number> = {};

export function rateLimitedFetch(url: string, limitMs = 2500, options?: RequestInit) {
  const now = Date.now();
  
  // Per-URL rate limiting only - removed global rate limiting as it was too aggressive
  // This allows different endpoints to be called in parallel
  const last = lastCallMap[url] || 0;
  if (now - last < limitMs) {
    return Promise.resolve({ skipped: true });
  }

  lastCallMap[url] = now;
  return fetch(url, options);
}

