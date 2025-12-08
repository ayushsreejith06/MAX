let lastCallMap: Record<string, number> = {};

export function rateLimitedFetch(url: string, limitMs = 2500, options?: RequestInit) {
  const last = lastCallMap[url] || 0;
  const now = Date.now();

  if (now - last < limitMs) {
    return Promise.resolve({ skipped: true });
  }

  lastCallMap[url] = now;
  return fetch(url, options);
}

