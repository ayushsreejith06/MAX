import { Agent, ApiPayload, Discussion, Sector, CandleData } from './types';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
const API_BASE = `${BACKEND.replace(/\/$/, '')}/api`;

function unwrapPayload<T>(payload: ApiPayload<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      ...init,
    });

    if (!response.ok) {
      let errorMessage = `Request failed: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }
      } catch {
        const text = await response.text();
        if (text) {
          errorMessage = text;
        }
      }
      throw new Error(errorMessage);
    }

    const payload = (await response.json()) as ApiPayload<T>;
    return unwrapPayload<T>(payload);
  } catch (error) {
    if (error instanceof Error) {
      // Check if it's a network error
      if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        throw new Error(`Cannot connect to backend server. Please ensure the backend is running on ${BACKEND}.`);
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
    id: String(raw?.id ?? ''),
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
    createdAt: raw?.createdAt ?? raw?.created_at ?? new Date().toISOString(),
  };
}

function normalizeDiscussion(raw: any): Discussion {
  const messages = Array.isArray(raw?.messages)
    ? raw.messages.map((message: any, index: number) => ({
        id: String(message?.id ?? `${raw?.id ?? 'disc'}-msg-${index}`),
        agentName: String(message?.agentName ?? message?.agent_name ?? 'Unknown Agent'),
        content: String(message?.content ?? ''),
        timestamp: message?.timestamp ?? new Date().toISOString(),
      }))
    : [];

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
        .filter((point): point is CandleData => Boolean(point))
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

  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? raw?.sectorName ?? 'Unknown Sector'),
    symbol: String(raw?.symbol ?? raw?.sectorSymbol ?? 'SECT'),
    currentPrice: Number.isFinite(basePrice) ? Number(basePrice.toFixed(2)) : 0,
    change: Number(raw?.change ?? 0),
    changePercent: Number(raw?.changePercent ?? raw?.change_percent ?? 0),
    volume: Number(raw?.volume ?? 0),
    agents,
    activeAgents: Number(raw?.activeAgents ?? raw?.active_agents ?? agents.filter(agent => agent.status === 'active').length),
    buyAgents: Number(raw?.buyAgents ?? raw?.buy_agents ?? 0),
    sellAgents: Number(raw?.sellAgents ?? raw?.sell_agents ?? 0),
    statusPercent: Number(raw?.statusPercent ?? raw?.status_percent ?? 0),
    candleData,
    discussions,
    createdAt: raw?.createdAt ?? raw?.created_at ?? new Date().toISOString(),
  };
}

export async function fetchSectors(): Promise<Sector[]> {
  try {
    const payload = await request<Sector[]>('/sectors');
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

  const payload = await request<Sector>(`/sectors/${id}`);
  return payload ? normalizeSector(payload) : null;
}

export async function fetchAgents(): Promise<Agent[]> {
  const payload = await request<Agent[]>('/agents');
  return Array.isArray(payload) ? payload.map(agent => normalizeAgent(agent)) : [];
}

export async function fetchAgentById(id: string): Promise<Agent | null> {
  if (!id) {
    return null;
  }

  const payload = await request<Agent>(`/agents/${id}`);
  return payload ? normalizeAgent(payload) : null;
}

export async function fetchDiscussions(): Promise<Discussion[]> {
  const payload = await request<Discussion[]>('/discussions');
  return Array.isArray(payload) ? payload.map(normalizeDiscussion) : [];
}

export async function createSector(sectorName: string, sectorSymbol: string): Promise<Sector> {
  const payload = await request<Sector>('/sectors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sectorName,
      sectorSymbol,
    }),
  });
  return normalizeSector(payload);
}

