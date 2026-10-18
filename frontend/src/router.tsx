import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import type { AuthContextValue } from "@/lib/auth/auth-context";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
  queryClient: QueryClient;
  auth: AuthContextValue;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

export function createAppRouter() {
  return createRouter({
    routeTree,
    // auth se inyecta en <RouterProvider context={{ auth }}> (main.tsx)
    context: { queryClient, auth: undefined as unknown as AuthContextValue },
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
