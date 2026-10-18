// Datos de prueba compartidos (solo para las pruebas automatizadas).
import type { TokenResponse, UserMe } from "@/lib/api/types";

export function makeUser(overrides: Partial<UserMe> = {}): UserMe {
  return {
    id: 1,
    email: "admin@sonardespierto.org",
    first_name: "Administrador",
    last_name: "General",
    role: "ADMIN",
    is_active: true,
    must_change_password: false,
    modules: [
      "VOLUNTARIOS",
      "BENEFICIARIOS",
      "EVENTOS",
      "CARTAS",
      "CALENDARIO",
      "INVENTARIO",
      "REPORTES",
    ],
    last_login_at: "2026-10-17T23:50:00Z",
    ...overrides,
  };
}

export function makeTokens(user: UserMe = makeUser(), n = 1): TokenResponse {
  return {
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    token_type: "bearer",
    expires_in: 1800,
    user,
  };
}

/** Respuesta JSON como la de la API. */
export function jsonResponse(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body ?? {}), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, { error: { code, message, details: null } });
}
