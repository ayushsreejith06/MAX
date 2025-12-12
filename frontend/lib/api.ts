import { Agent, ApiPayload, Discussion, Sector, CandleData, RejectedItem } from './types';
import { getApiBaseUrl, getBackendBaseUrl, isDesktopApp } from './desktopEnv';
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
    const backendUrl = typeof window !== 'undefined' ? getBackendBaseUrl() : BACKEND;
    const fullUrl = `${apiBase}${path}`;
    
    // Debug logging (always log to help debug issues)
    if (typeof window !== 'undefined') {
      console.log(`[API Request] ${init?.method || 'GET'} ${fullUrl}`);
      console.log(`[API Request] Backend base URL: ${backendUrl}`);
    }
    
    const response = await rateLimitedFetch(
      fullUrl, 
      500, // Minimum interval is now 500ms
      {
        cache: 'no-store',
        credentials: 'omit',
        ...init,
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(10000), // 10 second timeout
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
      // Check if it's a network error or timeout
      const isNetworkError = error.message.includes('fetch') || 
                            error.message.includes('Failed to fetch') || 
                            error.message.includes('NetworkError') || 
                            error.message.includes('timeout') ||
                            error.message.includes('aborted') ||
                            (error.name === 'TypeError' && error.message.includes('fetch'));
      
      if (isNetworkError) {
        // Always use dynamic detection for error messages
        const apiBase = typeof window !== 'undefined' ? getApiBaseUrl() : API_BASE;
        const backendUrl = typeof window !== 'undefined' ? getBackendBaseUrl() : BACKEND;
        const fullUrl = `${apiBase}${path}`;
        
        // Log more details
        console.error('[API Connection Error]', {
          error: error.message,
          name: error.name,
          attemptedUrl: fullUrl,
          backendUrl,
          apiBase,
          envApiUrl: process.env.NEXT_PUBLIC_API_URL,
          envBackendUrl: process.env.NEXT_PUBLIC_MAX_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL,
          isDesktop: typeof window !== 'undefined' ? isDesktopApp() : false,
        });
        
        // Try to check if backend health endpoint is reachable
        if (typeof window !== 'undefined') {
          try {
            const healthUrl = `${backendUrl}/health`;
            console.log(`[API] Checking backend health at: ${healthUrl}`);
            const healthCheck = await fetch(healthUrl, { 
              method: 'GET',
              cache: 'no-store',
              signal: AbortSignal.timeout(2000) // 2 second timeout for health check
            });
            if (healthCheck.ok) {
              console.log('[API] Backend health check passed, but API request failed. This might be a CORS or routing issue.');
            } else {
              console.error(`[API] Backend health check failed with status: ${healthCheck.status}`);
            }
          } catch (healthError) {
            console.error('[API] Backend health check also failed:', healthError);
          }
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

  const riskTolerance =
    raw?.riskTolerance ??
    raw?.personality?.riskTolerance ??
    raw?.personality?.risk_tolerance ??
    'Unknown';
  const displayName =
    typeof raw?.displayName === 'string' && raw.displayName.trim().length > 0
      ? raw.displayName.trim()
      : typeof raw?.name === 'string'
      ? raw.name
      : 'Unnamed Agent';
  const style = typeof raw?.style === 'string' ? raw.style : undefined;
  const initialConfidence =
    typeof raw?.initialConfidence === 'number'
      ? raw.initialConfidence
      : typeof raw?.confidence === 'number'
      ? raw.confidence
      : undefined;

  return {
    id: normalizeAgentId(raw?.id),
    name: displayName,
    displayName,
    role: String(raw?.role ?? 'agent'),
    style,
    riskTolerance,
    shortBio: typeof raw?.shortBio === 'string' ? raw.shortBio : undefined,
    initialConfidence,
    performance: Number(performanceValue || 0),
    trades: Number(tradesCount || 0),
    status: (raw?.status ?? 'idle') as Agent['status'],
    sectorId: raw?.sectorId ?? raw?.sector_id ?? null,
    sectorSymbol: raw?.sectorSymbol ?? raw?.sector_symbol ?? undefined,
    sectorName: raw?.sectorName ?? raw?.sector_name ?? undefined,
    personality: {
      riskTolerance,
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
    confidence: typeof raw?.confidence === 'number'
      ? raw.confidence
      : typeof initialConfidence === 'number'
      ? initialConfidence
      : 0,
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
        agentId: item?.agentId ?? item?.agent_id ?? item?.sourceAgentId ?? undefined,
        agentName: item?.agentName ?? item?.agent_name ?? undefined,
        round: typeof item?.round === 'number' ? item.round : undefined,
        action: item?.action ?? undefined,
        amount: typeof item?.amount === 'number' ? item.amount : undefined,
        allocationPercent: typeof item?.allocationPercent === 'number' ? item.allocationPercent : undefined,
        symbol: item?.symbol ?? undefined,
        reason: item?.reason ?? item?.reasoning ?? undefined,
        reasoning: item?.reasoning ?? item?.reason ?? undefined,
        rationale: item?.rationale ?? item?.reasoning ?? item?.reason ?? undefined,
        confidence: typeof item?.confidence === 'number' ? item.confidence : undefined,
        approvalStatus: item?.approvalStatus ?? undefined,
        approvalReason: item?.approvalReason ?? undefined,
        status: item?.status ?? undefined,
      }))
    : undefined;

  const finalizedChecklist = Array.isArray(raw?.finalizedChecklist)
    ? raw.finalizedChecklist.map((item: any) => ({
        id: String(item?.id ?? ''),
        text: String(item?.text ?? ''),
        agentId: item?.agentId ?? item?.agent_id ?? item?.sourceAgentId ?? undefined,
        agentName: item?.agentName ?? item?.agent_name ?? undefined,
        round: typeof item?.round === 'number' ? item.round : undefined,
        action: item?.action ?? undefined,
        amount: typeof item?.amount === 'number' ? item.amount : undefined,
        allocationPercent: typeof item?.allocationPercent === 'number' ? item.allocationPercent : undefined,
        symbol: item?.symbol ?? undefined,
        reason: item?.reason ?? item?.reasoning ?? undefined,
        reasoning: item?.reasoning ?? item?.reason ?? undefined,
        rationale: item?.rationale ?? item?.reasoning ?? item?.reason ?? undefined,
        confidence: typeof item?.confidence === 'number' ? item.confidence : undefined,
        approvalStatus: item?.approvalStatus ?? 'accepted', // Finalized items are accepted by default
        approvalReason: item?.approvalReason ?? undefined,
        status: item?.status ?? 'APPROVED',
      }))
    : undefined;

  // Normalize checklistItems - primary field (unified array)
  // If checklistItems is provided, use it; otherwise combine checklist and finalizedChecklist
  const checklistItems = Array.isArray(raw?.checklistItems)
    ? raw.checklistItems.map((item: any) => ({
        id: String(item?.id ?? ''),
        text: String(item?.text ?? ''),
        agentId: item?.agentId ?? item?.agent_id ?? item?.sourceAgentId ?? undefined,
        agentName: item?.agentName ?? item?.agent_name ?? undefined,
        round: typeof item?.round === 'number' ? item.round : undefined,
        action: item?.action ?? undefined,
        amount: typeof item?.amount === 'number' ? item.amount : undefined,
        allocationPercent: typeof item?.allocationPercent === 'number' ? item.allocationPercent : undefined,
        symbol: item?.symbol ?? undefined,
        reason: item?.reason ?? item?.reasoning ?? undefined,
        reasoning: item?.reasoning ?? item?.reason ?? undefined,
        rationale: item?.rationale ?? item?.reasoning ?? item?.reason ?? undefined,
        confidence: typeof item?.confidence === 'number' ? item.confidence : undefined,
        approvalStatus: item?.approvalStatus ?? undefined,
        approvalReason: item?.approvalReason ?? undefined,
        status: item?.status ?? undefined,
      }))
    : (checklist && finalizedChecklist 
        ? [...(checklist || []), ...(finalizedChecklist || [])]
        : checklist || finalizedChecklist || undefined);

  // Normalize status: only 'in_progress' or 'decided' are valid
  let normalizedStatus = raw?.status ?? 'in_progress';
  if (normalizedStatus === 'active' || normalizedStatus === 'open' || normalizedStatus === 'OPEN' || 
      normalizedStatus === 'created' || normalizedStatus === 'in_progress') {
    normalizedStatus = 'in_progress';
  } else if (normalizedStatus === 'closed' || normalizedStatus === 'CLOSED' || 
             normalizedStatus === 'archived' || normalizedStatus === 'finalized' || 
             normalizedStatus === 'accepted' || normalizedStatus === 'completed' ||
             normalizedStatus === 'decided') {
    normalizedStatus = 'decided';
  }

  return {
    id: String(raw?.id ?? ''),
    sectorId: String(raw?.sectorId ?? raw?.sector_id ?? ''),
    title: String(raw?.title ?? 'Untitled discussion'),
    status: normalizedStatus as Discussion['status'],
    agentIds: Array.isArray(raw?.agentIds)
      ? raw.agentIds.map((agentId: any) => String(agentId))
      : Array.isArray(raw?.agent_ids)
      ? raw.agent_ids.map((agentId: any) => String(agentId))
      : [],
    messages,
    messagesCount: typeof raw?.messagesCount === 'number' 
      ? raw.messagesCount 
      : (typeof raw?.messageCount === 'number' ? raw.messageCount : undefined),
    createdAt: raw?.createdAt ?? raw?.created_at ?? new Date().toISOString(),
    updatedAt: raw?.updatedAt ?? raw?.updated_at ?? new Date().toISOString(),
    sectorSymbol: raw?.sectorSymbol ?? raw?.sector_symbol ?? undefined,
    sectorName: raw?.sectorName ?? raw?.sector_name ?? undefined,
    round: typeof raw?.round === 'number' ? raw.round : undefined,
    checklistItems: checklistItems && checklistItems.length > 0 ? checklistItems : undefined,
    checklistDraft: checklistDraft && checklistDraft.length > 0 ? checklistDraft : undefined,
    checklist: checklist && checklist.length > 0 ? checklist : undefined,
    finalizedChecklist: finalizedChecklist && finalizedChecklist.length > 0 ? finalizedChecklist : undefined,
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
    balance: typeof raw?.balance === 'number' ? Number(raw.balance.toFixed(2)) : 0, // Default balance to 0 for new sectors
    // Additional fields
    lastSimulatedPrice: typeof raw?.lastSimulatedPrice === 'number' ? Number(raw.lastSimulatedPrice.toFixed(2)) : raw?.lastSimulatedPrice === null ? null : undefined,
    initialPrice: typeof raw?.initialPrice === 'number' && raw.initialPrice > 0 ? Number(raw.initialPrice.toFixed(2)) : undefined,
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

export interface DiscussionSummary {
  id: string;
  title: string;
  sector: string; // Sector symbol
  sectorId?: string; // Keep for backward compatibility
  status: Discussion['status'];
  updatedAt: string;
  participants: string[]; // Agent IDs array
  messagesCount: number; // Updated to match backend (was messageCount)
}

export interface PaginatedDiscussionsResponse {
  discussions: DiscussionSummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  statusCounts?: {
    all: number;
    in_progress: number;
    decided: number;
    rejected: number;
  };
}

export async function fetchDiscussions(page: number = 1, pageSize: number = 20, sectorId?: string, status?: string): Promise<PaginatedDiscussionsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  });
  if (sectorId) {
    params.append('sectorId', sectorId);
  }
  if (status && status !== 'all') {
    params.append('status', status);
  }

  const result = await request<PaginatedDiscussionsResponse>(`/discussions?${params.toString()}`);
  
  // Handle rate limiting - return empty result when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return {
      discussions: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0
      }
    };
  }
  
  const payload = result as PaginatedDiscussionsResponse;
  return payload || {
    discussions: [],
    pagination: {
      page,
      pageSize,
      total: 0,
      totalPages: 0
    }
  };
}

export async function fetchDiscussionMessages(discussionId: string): Promise<Message[]> {
  if (!discussionId) {
    return [];
  }

  const result = await request<{ messages: Message[] }>(`/discussions/${discussionId}/messages`);
  
  // Handle rate limiting - return empty array when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return [];
  }
  
  const payload = result as { messages: Message[] };
  if (payload && Array.isArray(payload.messages)) {
    return payload.messages.map((message: any, index: number) => ({
      id: String(message?.id ?? `${discussionId}-msg-${index}`),
      agentId: message?.agentId ?? message?.agent_id ?? undefined,
      agentName: String(message?.agentName ?? message?.agent_name ?? 'Unknown Agent'),
      content: String(message?.content ?? ''),
      timestamp: message?.timestamp ?? message?.createdAt ?? new Date().toISOString(),
      role: message?.role ?? undefined,
    }));
  }
  return [];
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

export async function fetchRejectedItems(): Promise<{ rejected: RejectedItem[] }> {
  const result = await request<{ rejected: RejectedItem[] }>('/discussions/rejected-items');
  
  // Handle rate limiting - return empty array when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return { rejected: [] };
  }
  
  const payload = result as { rejected: RejectedItem[] };
  return payload || { rejected: [] };
}

export interface ChecklistItemResponse {
  id: string;
  description?: string;
  action?: string;
  amount?: number;
  allocationPercent?: number; // 0–100
  symbol?: string;
  reason?: string;
  reasoning?: string;
  rationale?: string; // Primary field (1–2 sentences, concise)
  confidence?: number; // 0–100
  round?: number;
  agentId?: string;
  agentName?: string;
  approvalStatus?: 'pending' | 'accepted' | 'rejected' | 'accept_rejection';
  approvalReason?: string | null;
  approvedAt?: string;
  // Revision metadata
  status?: 'PENDING' | 'REVISE_REQUIRED' | 'APPROVED' | 'ACCEPT_REJECTION' | 'RESUBMITTED' | string;
  requiresRevision?: boolean;
  managerReason?: string | null;
  revisionCount?: number;
  revisedAt?: string;
  previousVersions?: Array<{
    action?: string;
    amount?: number;
    allocationPercent?: number;
    reason?: string;
    confidence?: number;
    timestamp: string;
  }>;
}

export interface ChecklistResponse {
  discussionId: string;
  status: string;
  checklistItems: ChecklistItemResponse[]; // Primary field - unified array
  checklist?: ChecklistItemResponse[]; // Legacy field
  finalizedChecklist?: ChecklistItemResponse[]; // Legacy field
}

export async function fetchChecklist(discussionId: string): Promise<ChecklistResponse | null> {
  if (!discussionId) {
    return null;
  }

  const result = await request<ChecklistResponse>(`/discussions/${discussionId}/checklist`);
  
  // Handle rate limiting - return null when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return null;
  }
  
  return result as ChecklistResponse | null;
}

export interface RejectedItemsResponse {
  success: boolean;
  discussionId: string;
  rejectedItems: ChecklistItemResponse[];
}

export async function getRejectedItemsForDiscussion(discussionId: string): Promise<RejectedItemsResponse | null> {
  if (!discussionId) {
    return null;
  }

  const result = await request<RejectedItemsResponse>(`/discussions/${discussionId}/rejected-items`);
  
  // Handle rate limiting - return null when skipped
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    return null;
  }
  
  return result as RejectedItemsResponse | null;
}

export interface SubmitRevisionParams {
  itemId: string;
  newContent: {
    action?: string;
    amount?: number;
    reason?: string;
    reasoning?: string;
    confidence?: number;
  };
}

export interface SubmitRevisionResponse {
  success: boolean;
  discussionId: string;
  itemId: string;
  item: {
    id: string;
    action?: string;
    amount?: number;
    reason?: string;
    confidence?: number;
    status: string;
    revisionCount: number;
  };
  allItemsResolved?: boolean;
}

export async function submitRevision(
  discussionId: string,
  params: SubmitRevisionParams
): Promise<SubmitRevisionResponse> {
  if (!discussionId || !params.itemId) {
    throw new Error('discussionId and itemId are required');
  }

  const result = await request<SubmitRevisionResponse>(`/discussions/${discussionId}/submit-revision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      itemId: params.itemId,
      newContent: params.newContent,
    }),
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  return result as SubmitRevisionResponse;
}

export interface AcceptRejectionResponse {
  success: boolean;
  discussionId: string;
  itemId: string;
  item: {
    id: string;
    status: string;
  };
  allItemsResolved?: boolean;
  discussionStatus?: string;
}

export async function acceptRejection(
  discussionId: string,
  itemId: string
): Promise<AcceptRejectionResponse> {
  if (!discussionId || !itemId) {
    throw new Error('discussionId and itemId are required');
  }

  const result = await request<AcceptRejectionResponse>(`/discussions/${discussionId}/accept-rejection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      itemId: itemId,
    }),
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  return result as AcceptRejectionResponse;
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

export async function startDiscussionRounds(discussionId: string, numRounds: number = 3): Promise<Discussion> {
  const result = await request<Discussion>(`/discussions/${discussionId}/start-rounds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ numRounds }),
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
    // Preserve error structure (including error.response) for proper error handling in modals
    // Extract error message from various possible formats
    const message =
      (error && error.message) ||
      'Failed to create agent. Please try again.';

    // Re-throw with preserved structure
    const newError = new Error(message) as any;
    if (error?.response) {
      newError.response = error.response;
    }
    throw newError;
  }
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

export async function withdrawSector(sectorId: string, amount?: number | 'all'): Promise<{ sector: Sector; withdrawnAmount: number }> {
  const payload = await request<{ success: boolean; sector: Sector; withdrawnAmount: number }>(`/sectors/${sectorId}/withdraw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: amount ?? 'all' }),
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (payload && typeof payload === 'object' && 'skipped' in payload && (payload as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  const result = payload as { success: boolean; sector: Sector; withdrawnAmount: number };
  return {
    sector: normalizeSector(result.sector),
    withdrawnAmount: result.withdrawnAmount
  };
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
 * Execution log entry
 */
export interface ExecutionLog {
  id: string;
  sectorId: string;
  checklistId?: string;
  managerId?: string;
  timestamp: number;
  executionType?: string;
  results?: Array<{
    itemId: string;
    action: string;
    actionType?: string;
    amount: number;
    allocation?: number;
    symbol?: string;
    success: boolean;
    reason?: string;
    impact?: number;
    managerImpact?: number;
  }>;
  impact?: number;
  action?: string;
  status?: string; // For approved items: 'APPROVED'
  score?: number; // Manager decision score
  managerReason?: string; // Manager's reason for approval/rejection
}

/**
 * Execution list item
 */
export interface ExecutionListItem {
  id: string;
  actionType: 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';
  symbol: string;
  allocation: number;
  generatedFromDiscussion?: string;
  createdAt: number;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  itemId: string;
  actionType: string;
  symbol: string;
  allocation: number;
  success: boolean;
  reason: string;
  managerImpact?: number;
}

/**
 * Fetch execution logs for a sector
 */
export async function fetchExecutionLogs(sectorId: string): Promise<ExecutionLog[]> {
  try {
    const result = await request<{ success: boolean; logs: ExecutionLog[] }>(`/execution/logs/${sectorId}`);
    
    // Handle rate limiting - return empty array when skipped
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return [];
    }
    
    const payload = result as { success: boolean; logs: ExecutionLog[] };
    if (payload && payload.success && Array.isArray(payload.logs)) {
      return payload.logs;
    }
    return [];
  } catch (error) {
    console.error('Error fetching execution logs:', error);
    return [];
  }
}

/**
 * Get execution list for a manager
 */
export async function getManagerExecutionList(managerId: string): Promise<ExecutionListItem[]> {
  try {
    const result = await request<{ success: boolean; executionList: ExecutionListItem[] }>(`/manager/${managerId}/execution-list`);
    
    // Handle rate limiting - return empty array when skipped
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return [];
    }
    
    const payload = result as { success: boolean; executionList: ExecutionListItem[] };
    if (payload && payload.success && Array.isArray(payload.executionList)) {
      return payload.executionList;
    }
    return [];
  } catch (error) {
    console.error('Error fetching manager execution list:', error);
    return [];
  }
}

/**
 * Execute all items in manager's execution list
 */
export async function executeManagerExecutionList(managerId: string): Promise<{
  success: boolean;
  executed: number;
  total: number;
  results: ExecutionResult[];
  updatedSectorState?: {
    id: string;
    capital: number;
    position: number;
    performance: any;
    utilization: number;
    currentPrice: number;
  };
}> {
  const result = await request<{
    success: boolean;
    executed: number;
    total: number;
    results: ExecutionResult[];
    updatedSectorState?: any;
  }>(`/manager/${managerId}/execute-all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  // Handle rate limiting - throw generic error for mutations
  if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
    throw new Error('Request was skipped. Please try again.');
  }
  
  return result as {
    success: boolean;
    executed: number;
    total: number;
    results: ExecutionResult[];
    updatedSectorState?: any;
  };
}

/**
 * Clear all discussions (development only)
 * Note: Uses backend base URL directly since debug routes are at /debug (not /api/debug)
 */
export async function clearAllDiscussions(): Promise<{ success: boolean; deletedCount: number }> {
  try {
    // Use backend base URL directly since debug routes are not under /api
    const backendBase = typeof window !== 'undefined' ? getBackendBaseUrl() : BACKEND;
    const fullUrl = `${backendBase}/debug/discussions/clear`;
    
    const response = await rateLimitedFetch(
      fullUrl,
      500,
      {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'omit',
      },
      { bypass: true } // Bypass rate limiting for user-triggered actions
    );

    if (!response.ok) {
      let errorMessage = `Request failed: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        const text = await response.text();
        if (text) {
          errorMessage = text;
        }
      }
      throw new Error(errorMessage);
    }

    const payload = await response.json();
    return payload as { success: boolean; deletedCount: number };
  } catch (error: any) {
    throw error;
  }
}

/**
 * Decision Logs API
 */

export interface ExecutionLogsFilters {
  page?: number;
  pageSize?: number;
  sectorId?: string;
  managerId?: string;
  discussionId?: string;
  startTime?: number;
  endTime?: number;
  actionType?: string;
}


export interface FinalizedRejectionsFilters {
  page?: number;
  pageSize?: number;
  sectorId?: string;
  managerId?: string;
  discussionId?: string;
  startTime?: number;
  endTime?: number;
}

export interface FinalizedRejection {
  id: string;
  timestamp: number;
  sectorSymbol: string;
  discussionId: string;
  discussionTitle: string;
  managerId?: string | null;
  action?: string;
  amount?: number | null;
  confidence?: number | null;
  managerReason?: string | null;
  text?: string;
  status?: string;
  isFinalized?: boolean;
  revisionCount?: number;
}

export async function fetchAllExecutionLogs(filters: ExecutionLogsFilters = {}): Promise<{ logs: ExecutionLog[]; pagination?: any }> {
  try {
    const params = new URLSearchParams();
    // Backend uses 'sector' not 'sectorId'
    if (filters.sectorId) params.append('sector', filters.sectorId);
    if (filters.managerId) params.append('managerId', filters.managerId);
    if (filters.discussionId) params.append('discussionId', filters.discussionId);
    if (filters.actionType) params.append('actionType', filters.actionType);
    if (filters.startTime && filters.endTime) {
      // Backend expects timeRange in format "start:end" or "lastNhours" or "lastNdays"
      const hours = Math.round((filters.endTime - filters.startTime) / (1000 * 60 * 60));
      if (hours <= 24) {
        params.append('timeRange', `last${hours}hours`);
      } else {
        const days = Math.round(hours / 24);
        params.append('timeRange', `last${days}days`);
      }
    }

    const result = await request<{ success: boolean; logs: ExecutionLog[] }>(`/decision-logs/executed?${params.toString()}`);
    
    // Handle rate limiting
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return { logs: [] };
    }
    
    const payload = result as { success: boolean; logs: ExecutionLog[] };
    return {
      logs: payload && payload.success && Array.isArray(payload.logs) ? payload.logs : [],
      pagination: { page: filters.page || 1, pageSize: filters.pageSize || 20, total: 0, totalPages: 0 }
    };
  } catch (error) {
    console.error('Error fetching execution logs:', error);
    return { logs: [] };
  }
}

export async function fetchFinalizedRejections(filters: FinalizedRejectionsFilters = {}): Promise<{ rejections: FinalizedRejection[]; pagination?: any }> {
  try {
    const params = new URLSearchParams();
    // Backend uses 'sector' not 'sectorId'
    if (filters.sectorId) params.append('sector', filters.sectorId);
    if (filters.managerId) params.append('managerId', filters.managerId);
    if (filters.discussionId) params.append('discussionId', filters.discussionId);
    if (filters.startTime && filters.endTime) {
      // Backend expects timeRange in format "start:end" or "lastNhours" or "lastNdays"
      const hours = Math.round((filters.endTime - filters.startTime) / (1000 * 60 * 60));
      if (hours <= 24) {
        params.append('timeRange', `last${hours}hours`);
      } else {
        const days = Math.round(hours / 24);
        params.append('timeRange', `last${days}days`);
      }
    }

    const result = await request<{ success: boolean; finalizedRejections: FinalizedRejection[] }>(`/decision-logs/finalized-rejections?${params.toString()}`);
    
    // Handle rate limiting
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      return { rejections: [] };
    }
    
    const payload = result as { success: boolean; finalizedRejections: FinalizedRejection[] };
    return {
      rejections: payload && payload.success && Array.isArray(payload.finalizedRejections) ? payload.finalizedRejections : [],
      pagination: { page: filters.page || 1, pageSize: filters.pageSize || 20, total: 0, totalPages: 0 }
    };
  } catch (error) {
    console.error('Error fetching finalized rejections:', error);
    return { rejections: [] };
  }
}

/**
 * Clear all decision logs (development/testing only)
 */
export async function clearDecisionLogs(): Promise<{ success: boolean }> {
  try {
    const result = await request<{ success: boolean }>(
      '/decision-logs/clear',
      {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'omit',
      },
      true // Bypass rate limiting for user-triggered actions
    );

    // Handle rate limiting
    if (result && typeof result === 'object' && 'skipped' in result && (result as any).skipped === true) {
      throw new Error('Request was rate-limited');
    }

    const payload = result as { success: boolean };
    return payload;
  } catch (error: any) {
    throw error;
  }
}

