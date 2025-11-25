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

export async function createSector(name: string): Promise<Sector> {
  const response = await fetch(`${API_BASE_URL}/sectors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create sector');
  }

  const result: CreateSectorResponse = await response.json();
  return result.data;
}

export async function getSectors(): Promise<Sector[]> {
  const response = await fetch(`${API_BASE_URL}/sectors`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch sectors');
  }

  const result: GetSectorsResponse = await response.json();
  return result.data;
}

export async function getSectorById(id: string) {
  const res = await fetch(`${API_BASE_URL}/sectors/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch sector " + id);
  const result = await res.json();
  return result.data;
}

export async function getAgents(sectorId?: string): Promise<Agent[]> {
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
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to fetch agents');
  }

  const result: GetAgentsResponse = await response.json();
  return result.data;
}

