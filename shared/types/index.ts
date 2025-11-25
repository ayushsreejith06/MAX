// Shared TypeScript types for MAX project

// Example types - to be expanded
export interface User {
  id: string;
  address: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

