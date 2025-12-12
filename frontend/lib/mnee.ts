import { getBackendBaseUrl } from './desktopEnv';

const getBase = () => {
  if (typeof window !== 'undefined') {
    // Client-side: use desktop-aware URL
    return getBackendBaseUrl();
  }
  // Server-side: use environment variable or default
  // Support NEXT_PUBLIC_API_URL (extract base from it) or NEXT_PUBLIC_MAX_BACKEND_URL/NEXT_PUBLIC_BACKEND_URL
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    // Extract base URL from API URL (remove /api suffix if present)
    return apiUrl.replace(/\/api\/?$/, '');
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || 
         process.env.NEXT_PUBLIC_MAX_BACKEND_URL || 
         'http://localhost:8000';
};

export async function registerSectorOnChain(sector: any) {
  const base = typeof window !== 'undefined' ? getBackendBaseUrl() : getBase();
  return fetch(`${base}/api/mnee/register-sector`, {
    method: "POST",
    body: JSON.stringify(sector),
    headers: { "Content-Type": "application/json" }
  }).then(r => r.json());
}

export async function registerAgentOnChain(agent: any) {
  const base = typeof window !== 'undefined' ? getBackendBaseUrl() : getBase();
  return fetch(`${base}/api/mnee/register-agent`, {
    method: "POST",
    body: JSON.stringify(agent),
    headers: { "Content-Type": "application/json" }
  }).then(r => r.json());
}

export async function logTradeOnChain(trade: any) {
  const base = typeof window !== 'undefined' ? getBackendBaseUrl() : getBase();
  return fetch(`${base}/api/mnee/log-trade`, {
    method: "POST",
    body: JSON.stringify(trade),
    headers: { "Content-Type": "application/json" }
  }).then(r => r.json());
}

export async function validateActionOnChain(input: any) {
  const base = typeof window !== 'undefined' ? getBackendBaseUrl() : getBase();
  return fetch(`${base}/api/mnee/validate`, {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" }
  }).then(r => r.json());
}

/**
 * Fetches all on-chain events (sectors, agents, trades) from the contract.
 * Returns parsed events with type, actor, timestamp, and data.
 */
export async function fetchContractEvents() {
  const base = typeof window !== 'undefined' ? getBackendBaseUrl() : getBase();
  const response = await fetch(`${base}/api/mnee/events`, {
    method: "GET",
    headers: { "Content-Type": "application/json" }
  });
  if (!response.ok) {
    // Try to parse error response for better error messages
    let errorMessage = `Failed to fetch contract events: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // If JSON parsing fails, use the status text
    }
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    throw error;
  }
  return response.json();
}

