// Guardas de ruta (Fase 1 §3.9). Funciones puras para usar en beforeLoad.
// El backend valida SIEMPRE los permisos: esto solo evita mostrar pantallas inaccesibles.
import { redirect } from "@tanstack/react-router";
import type { ModuleKey } from "@/lib/domain/access";
import type { AuthContextValue } from "@/lib/auth/auth-context";

export const CHANGE_PASSWORD_PATH = "/app/cambiar-contrasena";

/** Solo destinos internos de /app; cualquier otro (externo, //, /login…) → "/app". */
export function safeRedirect(target: string | undefined): string {
  if (!target || target.startsWith("//") || !target.startsWith("/app")) return "/app";
  const rest = target.slice("/app".length);
  return rest === "" || /^[/?#]/.test(rest) ? target : "/app";
}

export function requireAuth(
  auth: AuthContextValue,
  location: { href: string; pathname: string },
): void {
  if (!auth.isAuthenticated || !auth.user) {
    throw redirect({ to: "/login", search: { redirect: location.href } });
  }
  if (auth.user.must_change_password && location.pathname !== CHANGE_PASSWORD_PATH) {
    throw redirect({ to: CHANGE_PASSWORD_PATH });
  }
}

export function requireModule(auth: AuthContextValue, module: ModuleKey): void {
  if (!auth.hasModule(module)) {
    throw redirect({ to: "/app/sin-acceso", search: { modulo: module } });
  }
}

export function requireAdmin(auth: AuthContextValue): void {
  if (!auth.isAdmin) {
    throw redirect({ to: "/app/sin-acceso", search: {} });
  }
}
