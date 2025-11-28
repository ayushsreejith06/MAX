/**
 * Typed API client for MAX backend.
 * Provides type-safe functions to interact with the backend REST API.
 */

import type {
  Sector,
  SectorSummary,
  Agent,
  AgentWithSectorMeta,
  AgentStatus,
  Discussion,
  DiscussionSummary,
  DiscussionStatus,
  ApiResponse,
} from './types';

// Base URL for API requests
// Can be configured via environment variable: NEXT_PUBLIC_API_BASE_URL
const API_BASE_URL =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_BASE_URL
    : process.env.NEXT_PUBLIC_API_BASE_URL) || 'http://localhost:8000';

// API prefix - backend uses /api prefix
const API_PREFIX = '/api';

/**
 * Helper function to handle API responses.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
    try {
      const errorData: ApiResponse<never> = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // If response is not JSON, use status text
    }
    throw new Error(errorMessage);
  }

  const result: ApiResponse<T> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error || 'API request failed');
  }

  return result.data;
}

/**
 * Helper function to build query string from params.
 */
function buildQueryString(params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value);
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

// ============================================================================
// Sector API
// ============================================================================

/**
 * Get all sectors with summary information.
 * Returns sectors without nested heavy data (messages, full agent lists).
 *
 * @returns Promise resolving to array of sector summaries
 */
export async function getSectors(): Promise<SectorSummary[]> {
  try {
    const response = await fetch(`${API_BASE_URL}${API_PREFIX}/sectors`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return handleResponse<SectorSummary[]>(response);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running.`
      );
    }
    throw error;
  }
}

/**
 * Get a single sector by ID with full details including agents, discussions, and candle data.
 *
 * @param id - Sector ID
 * @returns Promise resolving to full sector data
 */
export async function getSectorById(id: string): Promise<Sector> {
  try {
    const response = await fetch(`${API_BASE_URL}${API_PREFIX}/sectors/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return handleResponse<Sector>(response);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running.`
      );
    }
    throw error;
  }
}

// ============================================================================
// Agent API
// ============================================================================

/**
 * Get all agents, optionally filtered by sector and/or status.
 * Returns flat list with sector metadata (sectorName, sectorSymbol).
 *
 * @param params - Optional filter parameters
 * @param params.sectorId - Filter by sector ID
 * @param params.status - Filter by agent status
 * @returns Promise resolving to array of agents with sector metadata
 */
export async function getAgents(params?: {
  sectorId?: string;
  status?: AgentStatus;
}): Promise<AgentWithSectorMeta[]> {
  try {
    const queryParams: Record<string, string | undefined> = {};
    if (params?.sectorId) {
      queryParams.sectorId = params.sectorId;
    }
    if (params?.status) {
      queryParams.status = params.status;
    }

    const queryString = buildQueryString(queryParams);
    const response = await fetch(
      `${API_BASE_URL}${API_PREFIX}/agents${queryString}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return handleResponse<AgentWithSectorMeta[]>(response);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running.`
      );
    }
    throw error;
  }
}

// ============================================================================
// Discussion API
// ============================================================================

/**
 * Get all discussions, optionally filtered by sector and/or status.
 * Returns list of summaries with id, title, status, sectorId, sectorSymbol, agentIds, messagesCount, updatedAt.
 *
 * @param params - Optional filter parameters
 * @param params.sectorId - Filter by sector ID
 * @param params.status - Filter by discussion status
 * @returns Promise resolving to array of discussion summaries
 */
export async function getDiscussions(params?: {
  sectorId?: string;
  status?: DiscussionStatus;
}): Promise<DiscussionSummary[]> {
  try {
    const queryParams: Record<string, string | undefined> = {};
    if (params?.sectorId) {
      queryParams.sectorId = params.sectorId;
    }
    if (params?.status) {
      queryParams.status = params.status;
    }

    const queryString = buildQueryString(queryParams);
    const response = await fetch(
      `${API_BASE_URL}${API_PREFIX}/discussions${queryString}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return handleResponse<DiscussionSummary[]>(response);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running.`
      );
    }
    throw error;
  }
}

/**
 * Get a single discussion by ID with full message log.
 * Returns full discussion with messages in chronological order.
 *
 * @param id - Discussion ID
 * @returns Promise resolving to full discussion data
 */
export async function getDiscussionById(id: string): Promise<Discussion> {
  try {
    const response = await fetch(
      `${API_BASE_URL}${API_PREFIX}/discussions/${id}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return handleResponse<Discussion>(response);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running.`
      );
    }
    throw error;
  }
}

