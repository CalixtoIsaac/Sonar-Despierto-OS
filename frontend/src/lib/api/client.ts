// Cliente HTTP único de la SPA: ningún componente debe llamar a fetch directamente.
import type { ApiErrorBody, TokenResponse } from "@/lib/api/types";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/auth/tokens";

export const API_BASE = "/api/v1";

const NETWORK_ERROR_MESSAGE =
  "No se pudo conectar con el servidor. Verifica que el programa Soñar Despierto siga abierto.";
const UNEXPECTED_ERROR_MESSAGE = "Ocurrió un error inesperado.";
const REFRESHABLE_CODES = new Set(["TOKEN_EXPIRED", "TOKEN_INVALID"]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean; // default true: agrega Authorization y aplica la lógica de 401
  notifyOnUnauthorized?: boolean; // default true: llama al manejador de sesión expirada
  signal?: AbortSignal;
}

let sessionExpiredHandler: (() => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function readErrorBody(res: Response): Promise<Partial<ApiErrorBody["error"]>> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody> | null;
    return body?.error ?? {};
  } catch {
    return {}; // cuerpo vacío o no JSON
  }
}

function toApiError(status: number, error: Partial<ApiErrorBody["error"]>): ApiError {
  return new ApiError(
    status,
    error.code ?? "HTTP_ERROR",
    error.message ?? UNEXPECTED_ERROR_MESSAGE,
    error.details ?? null,
  );
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    // Sin Authorization: el refresh_token viaja en el cuerpo
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as TokenResponse;
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

/** Renueva la sesión. Si ya hay una renovación en curso, se comparte (single-flight). */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, notifyOnUnauthorized = true, signal } = options;
  const hasBody = body !== undefined;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (hasBody) headers["Content-Type"] = "application/json";
    const token = auth ? getAccessToken() : null;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      return await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: hasBody ? JSON.stringify(body) : null,
        signal: signal ?? null,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiError(0, "NETWORK_ERROR", NETWORK_ERROR_MESSAGE);
    }
  };

  let res = await send();
  let retried = false;

  while (res.status === 401 && auth) {
    const error = await readErrorBody(res);
    if (!retried && REFRESHABLE_CODES.has(error.code ?? "") && (await refreshSession())) {
      retried = true;
      res = await send();
      continue;
    }
    clearTokens();
    if (notifyOnUnauthorized) sessionExpiredHandler?.();
    throw toApiError(401, error);
  }

  if (!res.ok) throw toApiError(res.status, await readErrorBody(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
