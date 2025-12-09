import { Agent, ApiPayload, Discussion, Sector, CandleData } from './types';
import { getApiBaseUrl, getBackendBaseUrl } from './desktopEnv';
import { rateLimitedFetch } from './rateLimit';

/**
 * Check if an error is a rate limit error from the server (HTTP 429 or server_rate_limit code)
 * This should ONLY be used for actual server rate limit errors, NOT internal throttle errors
 */
export function isRateLimitError(error: any): boolean {
  // Only check for actual HTTP 429 status or server_rate_limit code
  return (
    error?.response?.status === 429 ||
    error?.code === 'server_rate_limit' ||
    error?.status === 429
  );
}

/**
 * Check if a result indicates a skipped request (rate-limited)
 */
export function isSkippedResult<T>(result: T | { skipped: true }): result is { skipped: true } {
  return result !== null && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true;
}

// Use desktop-aware base URL
const getApiBase = () => {
  if (typeof window !== 'undefined') {
    // Client-side: use dynamic detection
    return getApiBaseUrl();
  }
  // Server-side: use environment variable or default
  // Support NEXT_PUBLIC_API_URL (full API URL) or NEXT_PUBLIC_MAX_BACKEND_URL/NEXT_PUBLIC_BACKEND_URL (base URL)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    return apiUrl.replace(/\/$/, '');
  }
  const backend = process.env.NEXT_PUBLIC_MAX_BACKEND_URL || 
                  process.env.NEXT_PUBLIC_BACKEND_URL || 
                  'http://localhost:8000';
  return `${backend.replace(/\/$/, '')}/api`;
};

const API_BASE = getApiBase();
const BACKEND = getBackendBaseUrl();

function unwrapPayload<T>(payload: ApiPayload<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

/**
 * Normalize agent ID: ensure it's a string and trim whitespace
 * @param id - Agent ID (can be string, number, or undefined)
 * @returns Normalized string ID or empty string if invalid
 */
function normalizeAgentId(id: any): string {
  if (!id) return '';
  const normalized = String(id).trim();
  return normalized || '';
}

async function request<T>(
  path: string, 
  init?: RequestInit,
  bypassRateLimit = false
): Promise<T | { skipped: true }> {
  try {
    // Get API base URL dynamically (handles desktop vs web mode)
    const apiBase = typeof window !== 'undefined' ? getApiBaseUrl() : API_BASE;
    const fullUrl = `${apiBase}${path}`;
    
    // Debug logging (always log to help debug issues)
    if (typeof window !== 'undefined') {
      console.log(`[API Request] ${init?.method || 'GET'} ${fullUrl}`);
    }
    
    const response = await rateLimitedFetch(
      fullUrl, 
      500, // Minimum interval is now 500ms
      {
        cache: 'no-store',
        credentials: 'omit',
        ...init,
      },
      { bypass: bypassRateLimit }
    );

    if (!response.ok) {
      let errorMessage = `Request failed: ${response.status}`;
      let errorResponse: any = null;
      try {
        const errorData = await response.json();
        errorResponse = errorData;
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }
        // Preserve success: false format if present
        if (errorData.success === false) {
          errorResponse = { success: false, error: errorMessage };
        }
      } catch {
        const text = await response.text();
        if (text) {
          errorMessage = text;
        }
      }
      const error = new Error(errorMessage) as any;
      if (errorResponse) {
        error.response = errorResponse;
      }
      throw error;
    }

    const payload = (await response.json()) as ApiPayload<T>;
    return unwrapPayload<T>(payload);
  } catch (error) {
    if (error instanceof Error) {
      // Check if it's a network error
      if (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.name === 'TypeError') {
        // Always use dynamic detection for error messages
        const apiBase = typeof window !== 'undefined' ? getApiBaseUrl() : API_BASE;
        const backendUrl = getBackendBaseUrl();
        const fullUrl = `${apiBase}${path}`;
        
        // Log more details in development
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          console.error('[API Error]', {
            error: error.message,
            name: error.name,
            attemptedUrl: fullUrl,
            backendUrl,
            envApiUrl: process.env.NEXT_PUBLIC_API_URL,
            envBackendUrl: process.env.NEXT_PUBLIC_MAX_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL,
          });
        }
        
        throw new Error(`Cannot connect to backend server. Please ensure the backend is running on ${backendUrl}. Attempted URL: ${fullUrl}`);
      }
      throw error;
    }
    throw new Error('An unknown error occurred');
  }
}

function normalizeCandleData(entry: any, index: number, fallbackPrice: number): CandleData | null {
  if (entry && typeof entry.time === 'string' && typeof entry.value === 'number') {
    return entry;
  }

  const valueCandidate =
    typeof entry?.value === 'number'
      ? entry.value
      : typeof entry?.close === 'number'
      ? entry.close
      : typeof fallbackPrice === 'number'
      ? fallbackPrice
      : 0;

  const hours = (index * 2) % 24;
  const minutes = (index * 5) % 60;
  const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  if (!Number.isFinite(valueCandidate)) {
    return null;
  }

  return {
    time,
    value: Number(valueCandidate.toFixed(2)),
  };
}

function normalizeAgent(raw: any): Agent {
  const performanceValue =
    typeof raw?.performance === 'number'
      ? raw.performance
      : typeof raw?.performance?.pnl === 'number'
      ? raw.performance.pnl
      : 0;

  const tradesCount = Array.isArray(raw?.trades)
    ? raw.trades.length
    : typeof raw?.trades === 'number'
    ? raw.trades
    : 0;

  return {
    id: normalizeAgentId(raw?.id),
    name: String(raw?.name ?? 'Unnamed Agent'),
    role: String(raw?.role ?? 'agent'),
    performance: Number(performanceValue || 0),
    trades: Number(tradesCount || 0),
    status: (raw?.status ?? 'idle') as Agent['status'],
    sectorId: raw?.sectorId ?? raw?.sector_id ?? null,
    sectorSymbol: raw?.sectorSymbol ?? raw?.sector_symbol ?? undefined,
    sectorName: raw?.sectorName ?? raw?.sector_name ?? undefined,
    personality: {
      riskTolerance: raw?.personality?.riskTolerance ?? raw?.personality?.risk_tolerance ?? 'Unknown',
      decisionStyle: raw?.personality?.decisionStyle ?? raw?.personality?.decision_style ?? 'Unknown',
    },
    prompt: typeof raw?.prompt === 'string' ? raw.prompt : undefined,
    preferences: raw?.preferences ? {
      riskWeight: typeof raw.preferences.riskWeight === 'number' ? raw.preferences.riskWeight : undefined,
      profitWeight: typeof raw.preferences.profitWeight === 'number' ? raw.preferences.profitWeight : undefined,
      speedWeight: typeof raw.preferences.speedWeight === 'number' ? raw.preferences.speedWeight : undefined,
      accuracyWeight: typeof raw.preferences.accuracyWeight === 'number' ? raw.preferences.accuracyWeight : undefined,
    } : undefined,
    morale: typeof raw?.morale === 'number' ? raw.morale : undefined,
    rewardPoints: typeof raw?.rewardPoints === 'number' ? raw.rewardPoints : undefined,
    confidence: typeof raw?.confidence === 'number' ? raw.confidence : 0,
    createdAt: raw?.createdAt ?? raw?.created_at ?? new Date().toISOString(),
    rawTrades: Array.isArray(raw?.trades) ? raw.trades : undefined,
    rawPerformance: typeof raw?.performance === 'object' ? raw.performance : undefined,
  };
}

function normalizeDiscussion(raw: any): Discussion {
  const messages = Array.isArray(raw?.messages)
    ? raw.messages.map((message: any, index: number) => ({
        id: String(message?.id ?? `${raw?.id ?? 'disc'}-msg-${index}`),
        agentId: message?.agentId ?? message?.agent_id ?? undefined,
        agentName: String(message?.agentName ?? message?.agent_name ?? 'Unknown Agent'),
        content: String(message?.content ?? ''),
        timestamp: message?.timestamp ?? message?.createdAt ?? new Date().toISOString(),
        role: message?.role ?? undefined,
      }))
    : [];

  const checklistDraft = Array.isArray(raw?.checklistDraft)
    ? raw.checklistDraft.map((item: any) => ({
        id: String(item?.id ?? ''),
        text: String(item?.text ?? ''),
        agentId: item?.agentId ?? item?.agent_id ?? undefined,
        agentName: item?.agentName ?? item?.agent_name ?? undefined,
        round: typeof item?.round === 'number' ? item.round : undefined,
      }))
    : undefined;

  const checklist = Array.isArray(raw?.checklist)
    ? raw.checklist.map((item: any) => ({
        id: String(item?.id ?? ''),
        text: String(item?.text ?? ''),
        agentId: item?.agentId ?? item?.agent_id ?? undefined,
        agentName: item?.agentName ?? item?.agent_name ?? undefined,
        round: typeof item?.round === 'number' ? item.round : undefined,
      }))
    : undefined;

  return {
    id: String(raw?.id ?? ''),
    sectorId: String(raw?.sectorId ?? raw?.sector_id ?? ''),
    title: String(raw?.title ?? 'Untitled discussion'),
    status: (raw?.status ?? 'in_progress') as Discussion['status'],
    agentIds: Array.isArray(raw?.agentIds)
      ? raw.agentIds.map((agentId: any) => String(agentId))
      : Array.isArray(raw?.agent_ids)
      ? raw.agent_ids.map((agentId: any) => String(agentId))
      : [],
    messages,
    createdAt: raw?.createdAt ?? raw?.created_at ?? new Date().toISOString(),
    updatedAt: raw?.updatedAt ?? raw?.updated_at ?? new Date().toISOString(),
    sectorSymbol: raw?.sectorSymbol ?? raw?.sector_symbol ?? undefined,
    sectorName: raw?.sectorName ?? raw?.sector_name ?? undefined,
    round: typeof raw?.round === 'number' ? raw.round : undefined,
    checklistDraft: checklistDraft && checklistDraft.length > 0 ? checklistDraft : undefined,
    checklist: checklist && checklist.length > 0 ? checklist : undefined,
  };
}

function normalizeSector(raw: any): Sector {
  const basePrice = Number(raw?.currentPrice ?? raw?.price ?? 0);

  const agents = Array.isArray(raw?.agents)
    ? raw.agents.map((agent: any) =>
        normalizeAgent({
          ...agent,
          sectorId: agent?.sectorId ?? raw?.id,
          sectorSymbol: agent?.sectorSymbol ?? raw?.symbol ?? raw?.sectorSymbol,
          sectorName: agent?.sectorName ?? raw?.name ?? raw?.sectorName,
        }),
      )
    : [];

  const candleData = Array.isArray(raw?.candleData)
    ? raw.candleData
        .map((entry: any, index: number) => normalizeCandleData(entry, index, basePrice))
        .filter((point: any): point is CandleData => Boolean(point))
    : [];

  const discussions = Array.isArray(raw?.discussions)
    ? raw.discussions.map((discussion: any) =>
        normalizeDiscussion({
          ...discussion,
          sectorId: discussion?.sectorId ?? raw?.id,
          sectorSymbol: discussion?.sectorSymbol ?? raw?.symbol ?? raw?.sectorSymbol,
          sectorName: discussion?.sectorName ?? raw?.name ?? raw?.sectorName,
        }),
      )
    : [];

  // Calculate activeAgents if not provided
  const activeAgents = typeof raw?.activeAgents === 'number' 
    ? raw.activeAgents 
    : typeof raw?.active_agents === 'number'
    ? raw.active_agents
    : agents.filter((agent: any) => agent.status === 'active').length;

  return {
    id: String(raw?.id ?? ''),
    // Primary standardized fields (prefer name/symbol, fallback to sectorName/sectorSymbol)
    name: String(raw?.name ?? raw?.sectorName ?? 'Unknown Sector'),
    symbol: String(raw?.symbol ?? raw?.sectorSymbol ?? 'N/A'),
    // Backward compatibility fields (include if present)
    sectorName: raw?.sectorName ?? raw?.name ?? undefined,
    sectorSymbol: raw?.sectorSymbol ?? raw?.symbol ?? undefined,
    // Core market data fields
    currentPrice: Number.isFinite(basePrice) ? Number(basePrice.toFixed(2)) : 0,
    change: Number(raw?.change ?? 0),
    changePercent: Number(raw?.changePercent ?? raw?.change_percent ?? 0),
    volume: Number(raw?.volume ?? 0),
    // Risk and volatility
    volatility: typeof raw?.volatility === 'number' ? Number(raw.volatility.toFixed(4)) : undefined,
    riskScore: typeof raw?.riskScore === 'number' ? Number(raw.riskScore) : undefined,
    // Agent and activity fields
    agents,
    activeAgents: Number(activeAgents),
    buyAgents: typeof raw?.buyAgents === 'number' ? Number(raw.buyAgents) : typeof raw?.buy_agents === 'number' ? Number(raw.buy_agents) : undefined,
    sellAgents: typeof raw?.sellAgents === 'number' ? Number(raw.sellAgents) : typeof raw?.sell_agents === 'number' ? Number(raw.sell_agents) : undefined,
    statusPercent: Number(raw?.statusPercent ?? raw?.status_percent ?? 0),
    // Performance and balance
    performance: raw?.performance && typeof raw.performance === 'object' ? raw.performance : undefined,
    balance: typeof raw?.balance === 'number' ? Number(raw.balance.toFixed(2)) : undefined,
    // Additional fields
    lastSimulatedPrice: typeof raw?.lastSimulatedPrice === 'number' ? Number(raw.lastSimulatedPrice.toFixed(2)) : raw?.lastSimulatedPrice === null ? null : undefined,
    discussions,
    candleData,
    description: typeof raw?.description === 'string' ? raw.description : undefined,
    createdAt: raw?.createdAt ?? raw?.created_at ?? new Date().toISOString(),
  };
}

export async function fetchSectors(): Promise<Sector[]> {
  try {
    const result = await request<Sector[]>('/sectors');
    
    // Handle rate limiting - return empty array when skipped
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return [];
    }
    
    const payload = result as Sector[];
    if (!payload) {
      return [];
    }
    return Array.isArray(payload) ? payload.map(normalizeSector) : [];
  } catch (error) {
    console.error('Error fetching sectors:', error);
    throw error;
  }
}

export async function fetchSectorById(id: string): Promise<Sector | null> {
  if (!id) {
    return null;
  }

  // Normalize ID to lowercase for consistent case-sensitivity
  const normalizedId = String(id).trim().toLowerCase();
  
  const result = await request<Sector>(`/sectors/${normalizedId}`);
  
  // Handle rate limiting - return null when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return null;
  }
  
  const payload = result as Sector;
  return payload ? normalizeSector(payload) : null;
}

// Manager Agent API functions
export interface ManagerStatus {
  isRunning: boolean;
  managerCount: number;
  tickIntervalMs: number;
  decisionLogSize: number;
  managers: Array<{
    id: string;
    sectorId: string;
    name: string;
    lastDecision: {
      action: string;
      confidence: number;
      reason: string;
      timestamp: number;
    } | null;
    decisionCount: number;
  }>;
}

export interface ManagerDecision {
  managerId: string;
  sectorId: string;
  decision: {
    action: string;
    confidence: number;
    reason: string;
    voteBreakdown?: { BUY: number; SELL: number; HOLD: number };
    conflictScore?: number;
    timestamp: number;
  };
  timestamp: number;
}

export async function fetchManagerStatus(): Promise<ManagerStatus | null> {
  try {
    const result = await request<{ success: boolean; data: ManagerStatus }>('/simulation/status');
    
    // Handle rate limiting - return null when skipped
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return null;
    }
    
    const payload = result as { success: boolean; data: ManagerStatus };
    return payload && payload.success ? payload.data : null;
  } catch (error) {
    console.error('Error fetching manager status:', error);
    return null;
  }
}

export async function fetchManagerDecisions(sectorId: string): Promise<ManagerDecision[]> {
  try {
    const result = await request<{ success: boolean; data: ManagerDecision[] }>(`/simulation/decisions/${sectorId}`);
    
    // Handle rate limiting - return empty array when skipped
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return [];
    }
    
    const payload = result as { success: boolean; data: ManagerDecision[] };
    return payload && payload.success ? payload.data : [];
  } catch (error) {
    console.error('Error fetching manager decisions:', error);
    return [];
  }
}

export async function fetchAgents(): Promise<Agent[]> {
  const result = await request<Agent[]>('/agents');
  
  // Handle rate limiting - return empty array when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return [];
  }
  
  const payload = result as Agent[];
  return Array.isArray(payload) ? payload.map(agent => normalizeAgent(agent)) : [];
}

export async function fetchAgentById(id: string): Promise<Agent | null> {
  // Normalize and validate ID before making request
  const normalizedId = normalizeAgentId(id);
  if (!normalizedId) {
    console.warn('[fetchAgentById] Invalid or empty agent ID provided');
    return null;
  }

  const result = await request<Agent>(`/agents/${encodeURIComponent(normalizedId)}`);
  
  // Handle rate limiting - return null when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return null;
  }
  
  const payload = result as Agent;
  return payload ? normalizeAgent(payload) : null;
}

export async function fetchDiscussions(): Promise<Discussion[]> {
  const result = await request<Discussion[]>('/discussions');
  
  // Handle rate limiting - return empty array when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return [];
  }
  
  const payload = result as Discussion[];
  return Array.isArray(payload) ? payload.map(normalizeDiscussion) : [];
}

export async function fetchDiscussionById(id: string): Promise<Discussion | null> {
  if (!id) {
    return null;
  }

  const result = await request<Discussion>(`/discussions/${id}`);
  
  // Handle rate limiting - return null when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return null;
  }
  
  // Handle rate limiting - return null when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return null;
  }
  
  const payload = result as Discussion;
  return payload ? normalizeDiscussion(payload) : null;
}

export async function createDiscussion(
  sectorId: string,
  title: string,
  agentIds: string[] = []
): Promise<Discussion> {
  const result = await request<Discussion>('/discussions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sectorId,
      title,
      agentIds,
    }),
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as Discussion;
  return normalizeDiscussion(payload);
}

export interface AddMessageParams {
  agentId: string;
  content: string;
  role?: string;
  agentName?: string;
}

export async function addDiscussionMessage(
  discussionId: string,
  message: AddMessageParams
): Promise<Discussion> {
  const result = await request<Discussion>(`/discussions/${discussionId}/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as Discussion;
  return normalizeDiscussion(payload);
}

export async function closeDiscussion(discussionId: string): Promise<Discussion> {
  const result = await request<Discussion>(`/discussions/${discussionId}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as Discussion;
  return normalizeDiscussion(payload);
}

export async function deleteDiscussion(discussionId: string): Promise<void> {
  const result = await request<{ success: boolean; message?: string }>(`/discussions/${discussionId}`, {
    method: 'DELETE',
    // Don't send Content-Type header for DELETE requests without body
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  if (result && typeof result === 'object' && 'success' in result && !result.success) {
    throw new Error((result as any).error || 'Failed to delete discussion');
  }
}

export async function archiveDiscussion(discussionId: string): Promise<Discussion> {
  const result = await request<Discussion>(`/discussions/${discussionId}/archive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as Discussion;
  return normalizeDiscussion(payload);
}

export async function acceptDiscussion(discussionId: string): Promise<Discussion> {
  const result = await request<Discussion>(`/discussions/${discussionId}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as Discussion;
  return normalizeDiscussion(payload);
}

export async function rejectDiscussion(discussionId: string): Promise<Discussion> {
  const result = await request<Discussion>(`/discussions/${discussionId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as Discussion;
  return normalizeDiscussion(payload);
}

export async function createSector(sectorName: string, sectorSymbol: string): Promise<Sector> {
  // Bypass rate limiting for user-triggered actions - always execute immediately
  const result = await request<Sector>('/sectors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sectorName,
      sectorSymbol,
    }),
  }, true); // bypassRateLimit = true
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as Sector;
  return normalizeSector(payload);
}

export async function createAgent(
  prompt: string,
  sectorId: string | null,
  role?: string | null
): Promise<Agent> {
  try {
    const result = await request<unknown>('/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        sectorId,
        role: role || null,
      }),
    });

    // Handle rate limiting - throw generic error for mutations
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      throw new Error('Request was skipped. Please try again.');
    }

    const payload = result as unknown;

    // Handle both `{ success: true, data: Agent }` and direct `Agent`
    let rawAgent: unknown;

    if (
      payload &&
      typeof payload === 'object' &&
      'success' in payload &&
      (payload as any).success === true &&
      'data' in payload
    ) {
      rawAgent = (payload as any).data;
    } else {
      rawAgent = payload;
    }

    // At this point we expect `rawAgent` to be an Agent-like object
    const agent = normalizeAgent(rawAgent as Agent);
    return agent;
  } catch (error: any) {
    // Optionally inspect error.response / error.message depending on `request` helper
    const message =
      (error && error.message) ||
      'Failed to create agent. Please try again.';

    // Re-throw as a standard Error for callers (modals/pages) to handle
    throw new Error(message);
  }
}

export interface SimulateTickResult {
  sectorId: string;
  timestamp: number;
  newPrice: number;
  riskScore: number;
  executedTrades: any[];
  rejectedTrades: any[];
  orderbook: any;
  lastTrade: any;
  priceChange: number;
  priceChangePercent: number;
}

export async function simulateTick(sectorId: string, decisions: any[] = []): Promise<SimulateTickResult> {
  const result = await request<{ success: boolean; data: SimulateTickResult } | SimulateTickResult>(`/simulation/tick`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sectorId,
      decisions,
    }),
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as { success: boolean; data: SimulateTickResult } | SimulateTickResult;
  
  // Handle both wrapped and unwrapped responses
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    return (payload as { success: boolean; data: SimulateTickResult }).data;
  }
  return payload as SimulateTickResult;
}

export async function updateSectorPerformance(sectorId: string): Promise<Sector> {
  const payload = await request<{ success: boolean; data: Sector } | Sector>(`/simulation/${sectorId}/performance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  // Handle both wrapped and unwrapped responses
  let sectorData: any = payload;
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    sectorData = (payload as { success: boolean; data: Sector }).data;
  }
  return normalizeSector(sectorData);
}

export async function depositSector(sectorId: string, amount: number): Promise<Sector> {
  const payload = await request<{ success: boolean; data: Sector } | Sector>(`/sectors/${sectorId}/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount }),
  });
  
  // Handle both wrapped and unwrapped responses
  let sectorData: any = payload;
  if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
    sectorData = (payload as { success: boolean; data: Sector }).data;
  }
  return normalizeSector(sectorData);
}

export async function updateAgent(agentId: string, updates: {
  name?: string;
  role?: string;
  prompt?: string;
  sectorId?: string | null;
  personality?: {
    riskTolerance?: string;
    decisionStyle?: string;
  };
  preferences?: {
    riskWeight?: number;
    profitWeight?: number;
    speedWeight?: number;
    accuracyWeight?: number;
  };
}): Promise<Agent> {
  // Normalize and validate ID before making request
  const normalizedId = normalizeAgentId(agentId);
  if (!normalizedId) {
    throw new Error('Invalid agent ID provided');
  }

  // Bypass rate limiting for user-triggered actions - always execute immediately
  const result = await request<Agent>(`/agents/${encodeURIComponent(normalizedId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  }, true); // bypassRateLimit = true
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as Agent;
  return normalizeAgent(payload);
}

export async function deleteAgent(agentId: string): Promise<void> {
  // Normalize and validate ID before making request
  const normalizedId = normalizeAgentId(agentId);
  if (!normalizedId) {
    throw new Error('Invalid agent ID provided');
  }

  const result = await request<{ success: boolean; message?: string }>(`/agents/${encodeURIComponent(normalizedId)}`, {
    method: 'DELETE',
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
}

export async function deleteSector(sectorId: string, confirmationCode: string): Promise<{ success: boolean; message?: string; withdrawnBalance?: number }> {
  const result = await request<{ success: boolean; message?: string; withdrawnBalance?: number }>(`/sectors/${sectorId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ confirmationCode }),
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const payload = result as { success: boolean; message?: string; withdrawnBalance?: number };
  return payload;
}

export async function getUserBalance(): Promise<number> {
  try {
    const result = await request<{ balance: number }>('/user/balance');
    
    // Handle rate limiting - return 0 when skipped
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return 0;
    }
    
    const data = result as { balance: number };
    return typeof data.balance === 'number' ? data.balance : 0;
  } catch (error) {
    console.error('Failed to fetch user balance:', error);
    return 0;
  }
}

export interface ConfidenceTickResult {
  agents: Array<{
    id: string;
    name: string;
    confidence: number;
  }>;
  discussionReady: boolean;
}

export async function runConfidenceTick(sectorId: string): Promise<ConfidenceTickResult | null> {
  try {
    const result = await request<ConfidenceTickResult>(`/sectors/${sectorId}/confidence-tick`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    
    // Handle rate limiting - return null when skipped so polling can continue silently
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return null;
    }
    
    return result as ConfidenceTickResult;
  } catch (error: any) {
    // Re-throw errors (only real HTTP errors should reach here)
    throw error;
  }
}

export async function sendMessageToManager(sectorId: string, message: string): Promise<{ success: boolean; message?: string }> {
  try {
    const result = await request<{ success: boolean; message?: string }>(`/sectors/${sectorId}/message-manager`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
    
    // Handle rate limiting
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      throw new Error('Request was rate-limited. Please try again later.');
    }
    
    return result as { success: boolean; message?: string };
  } catch (error: any) {
    throw error;
  }
}

/**
 * System mode types
 */
export type SystemMode = 'simulation' | 'realtime';

/**
 * Get current system mode
 */
export async function getSystemMode(): Promise<SystemMode> {
  try {
    const result = await request<{ success: boolean; mode: SystemMode }>('/system/mode', {
      method: 'GET',
    });
    
    // Handle rate limiting
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      throw new Error('Request was rate-limited. Please try again later.');
    }
    
    const payload = result as { success: boolean; mode: SystemMode };
    return payload.mode;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Set system mode
 */
export async function setSystemMode(mode: SystemMode): Promise<SystemMode> {
  try {
    const result = await request<{ success: boolean; mode: SystemMode }>('/system/mode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode }),
    });
    
    // Handle rate limiting
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      throw new Error('Request was rate-limited. Please try again later.');
    }
    
    const payload = result as { success: boolean; mode: SystemMode };
    return payload.mode;
  } catch (error: any) {
    throw error;
  }
}

