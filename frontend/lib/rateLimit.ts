let lastCallMap: Record<string, number> = {};

export interface RateLimitOptions {
  bypass?: boolean;
  limitMs?: number;
}

export async function rateLimitedFetch(
  url: string, 
  limitMs = 500, 
  options?: RequestInit,
  rateLimitOptions?: RateLimitOptions
): Promise<Response> {
  const bypass = rateLimitOptions?.bypass ?? false;
  const effectiveLimitMs = rateLimitOptions?.limitMs ?? limitMs;
  
  // If bypass is enabled, execute immediately without any rate limiting
  if (bypass) {
    return fetch(url, options);
  }
  
  const now = Date.now();
  
  // Per-URL rate limiting only - removed global rate limiting as it was too aggressive
  // This allows different endpoints to be called in parallel
  const last = lastCallMap[url] || 0;
  const timeSinceLastCall = now - last;
  
  if (timeSinceLastCall < effectiveLimitMs) {
    // Instead of skipping, wait until the interval has passed
    const waitTime = effectiveLimitMs - timeSinceLastCall;
    console.warn(
      `[Rate Limiter] Request to ${url} rate limited. Waiting ${waitTime}ms before executing. ` +
      `(Last call was ${timeSinceLastCall}ms ago, minimum interval is ${effectiveLimitMs}ms)`
    );
    
    // Wait for the remaining time
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  // Update last call time and execute
  const executeTime = Date.now();
  lastCallMap[url] = executeTime;
  
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[Limiter] URL:', url, 'action:', 'executed', 'timestamp:', executeTime);
  }
  
  return fetch(url, options);
}

