import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, setSessionExpiredHandler } from "@/lib/api/client";
import type { TokenResponse, UserMe } from "@/lib/api/types";
import { clearTokens, hasStoredSession, setTokens } from "@/lib/auth/tokens";
import type { ModuleKey } from "@/lib/domain/access";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  user: UserMe | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasModule: (module: ModuleKey) => boolean;
  login: (email: string, password: string) => Promise<UserMe>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<UserMe | null>;
  applyTokenResponse: (response: TokenResponse) => void; // guarda tokens y usuario
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionState {
  status: AuthStatus;
  user: UserMe | null;
}

const ANONYMOUS: SessionState = { status: "anonymous", user: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Sin tokens guardados se arranca como anónimo sin llamar a la API
  const [session, setSession] = useState<SessionState>(() =>
    hasStoredSession() ? { status: "loading", user: null } : ANONYMOUS,
  );

  const reloadUser = useCallback(async (): Promise<UserMe | null> => {
    try {
      const user = await apiFetch<UserMe>("/auth/me", { notifyOnUnauthorized: false });
      setSession({ status: "authenticated", user });
      return user;
    } catch {
      clearTokens();
      setSession(ANONYMOUS);
      return null;
    }
  }, []);

  // Arranque: restaurar la sesión guardada (si la hay)
  useEffect(() => {
    if (session.status === "loading") void reloadUser();
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setSession(ANONYMOUS);
      queryClient.clear();
      toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  const applyTokenResponse = useCallback((response: TokenResponse) => {
    setTokens(response.access_token, response.refresh_token);
    setSession({ status: "authenticated", user: response.user });
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<UserMe> => {
      const response = await apiFetch<TokenResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      applyTokenResponse(response);
      return response.user;
    },
    [applyTokenResponse],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiFetch<void>("/auth/logout", { method: "POST", notifyOnUnauthorized: false });
    } catch {
      // Aunque la API falle, la sesión local se cierra igual
    } finally {
      clearTokens();
      setSession(ANONYMOUS);
      queryClient.clear();
      toast.success("Sesión cerrada");
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const { status, user } = session;
    return {
      status,
      user,
      isAuthenticated: status === "authenticated" && user !== null,
      isAdmin: user?.role === "ADMIN",
      hasModule: (module) => user?.modules.includes(module) ?? false,
      login,
      logout,
      reloadUser,
      applyTokenResponse,
    };
  }, [session, login, logout, reloadUser, applyTokenResponse]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
