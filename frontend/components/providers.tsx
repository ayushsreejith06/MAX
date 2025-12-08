'use client';

import { SWRConfig } from 'swr';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

/**
 * SWR Configuration
 * - Disabled revalidateOnFocus to prevent refetch on window focus
 * - Disabled revalidateOnReconnect to prevent refetch on network reconnect
 * - Set refreshInterval to 2500ms for controlled polling
 * - Configured to prevent refetch cascades and UI flicker
 */
const swrConfig = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  refreshInterval: 2500,
  // Prevent refetch cascades by deduplicating requests
  dedupingInterval: 2500,
  // Disable automatic revalidation on mount if data exists
  revalidateIfStale: false,
  // SWR keeps previous data by default, preventing UI flicker
  // Disable revalidation on mount to prevent unnecessary refetches
  revalidateOnMount: false,
};

/**
 * React Query Configuration
 * - Disabled refetchOnWindowFocus to prevent refetch on window focus
 * - Set refetchInterval to 2500ms for controlled polling
 * - Disabled refetchIntervalInBackground to prevent background refetching
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchInterval: 2500,
        refetchIntervalInBackground: false,
        // Prevent refetch cascades
        staleTime: 2500,
        // Keep previous data while fetching to prevent UI flicker
        placeholderData: (previousData) => previousData,
        // Disable automatic refetch on mount if data exists
        refetchOnMount: false,
        // Disable refetch on reconnect
        refetchOnReconnect: false,
      },
    },
  });
}

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Create QueryClient instance once and reuse it
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SWRConfig value={swrConfig}>
        {children}
      </SWRConfig>
    </QueryClientProvider>
  );
}

