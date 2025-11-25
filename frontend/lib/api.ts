const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Sector {
  id: string;
  name: string;
  createdAt?: string;
}

export interface CreateSectorResponse {
  success: boolean;
  data: Sector;
  error?: string;
}

export interface GetSectorsResponse {
  success: boolean;
  data: Sector[];
  error?: string;
}

export interface Agent {
  id: string;
  sectorId: string | null;
  role: string;
  personality: {
    riskTolerance?: string;
    decisionStyle?: string;
    communicationStyle?: string;
    [key: string]: any;
  };
  createdAt: string;
  memory?: Array<{
    type: string;
    content: string;
    timestamp: string;
  }>;
}

export interface GetAgentsResponse {
  success: boolean;
  data: Agent[];
  error?: string;
}

export interface Debate {
  id: string;
  sectorId: string;
  title: string;
  agentIds: string[];
  messages: Array<{
    agentId: string;
    content: string;
    role: string;
    createdAt: string;
  }>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function createSector(name: string): Promise<Sector> {
  try {
    const response = await fetch(`${API_BASE_URL}/sectors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to create sector';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = `Server returned ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const result: CreateSectorResponse = await response.json();
    return result.data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running.`);
    }
    throw error;
  }
}

export async function getSectors(): Promise<Sector[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/sectors`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      let errorMessage = 'Failed to fetch sectors';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = `Server returned ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const result: GetSectorsResponse = await response.json();
    return result.data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running.`);
    }
    throw error;
  }
}

export async function getSectorById(id: string) {
  try {
    const res = await fetch(`${API_BASE_URL}/sectors/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      let errorMessage = `Failed to fetch sector ${id}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = `Server returned ${res.status}: ${res.statusText}`;
      }
      throw new Error(errorMessage);
    }
    const result = await res.json();
    return result.data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running.`);
    }
    throw error;
  }
}

export async function getAgents(sectorId?: string): Promise<Agent[]> {
  try {
    const url = sectorId 
      ? `${API_BASE_URL}/agents?sectorId=${sectorId}`
      : `${API_BASE_URL}/agents`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      let errorMessage = 'Failed to fetch agents';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = `Server returned ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const result: GetAgentsResponse = await response.json();
    return result.data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running.`);
    }
    throw error;
  }
}

export async function getDebates(sectorId?: string) {
  const url = sectorId
    ? `${API_BASE_URL}/debates?sectorId=${sectorId}`
    : `${API_BASE_URL}/debates`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) throw new Error("Failed to fetch debates");

  const data = await res.json();

  return data.data;
}

export async function getDebateById(id: string) {
  const res = await fetch(`${API_BASE_URL}/debates/${id}`);

  if (!res.ok) throw new Error("Failed to fetch debate");

  const data = await res.json();

  return data.data;
}

