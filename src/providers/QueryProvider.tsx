'use client';
// =============================================================================
// LUMEA — React Query Provider
// Wrap your root layout with this. Compatible with Next.js 13+ App Router.
// =============================================================================

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Billing data is critical — don't stale-while-revalidate silently.
        staleTime:          30 * 1000,    // 30 seconds
        gcTime:             5 * 60 * 1000, // 5 minutes
        retry:              2,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: 0, // Billing mutations must not silently retry — surface errors immediately.
      },
    },
  });
}

// Singleton on the server to avoid recreating on every RSC render;
// new instance per browser session to prevent shared state across users.
let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always new instance
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

interface QueryProviderProps {
  children: React.ReactNode;
}

export default function QueryProvider({ children }: QueryProviderProps) {
  // Use useState so the client is stable across re-renders without
  // creating a new client on every render.
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}
