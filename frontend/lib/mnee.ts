const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export async function registerSectorOnChain(sector: any) {
  return fetch(`${BASE}/api/mnee/register-sector`, {
    method: "POST",
    body: JSON.stringify(sector),
    headers: { "Content-Type": "application/json" }
  }).then(r => r.json());
}

export async function registerAgentOnChain(agent: any) {
  return fetch(`${BASE}/api/mnee/register-agent`, {
    method: "POST",
    body: JSON.stringify(agent),
    headers: { "Content-Type": "application/json" }
  }).then(r => r.json());
}

export async function logTradeOnChain(trade: any) {
  return fetch(`${BASE}/api/mnee/log-trade`, {
    method: "POST",
    body: JSON.stringify(trade),
    headers: { "Content-Type": "application/json" }
  }).then(r => r.json());
}

export async function validateActionOnChain(input: any) {
  return fetch(`${BASE}/api/mnee/validate`, {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" }
  }).then(r => r.json());
}

