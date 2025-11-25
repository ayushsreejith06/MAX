const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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

