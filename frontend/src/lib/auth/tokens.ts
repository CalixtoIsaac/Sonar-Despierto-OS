// Tokens de sesión en sessionStorage (ADR-0007): se borran al cerrar la pestaña.
// Nunca en localStorage ni en la URL, y nunca se imprimen en consola.

const ACCESS_KEY = "sd.access_token";
const REFRESH_KEY = "sd.refresh_token";

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null; // almacenamiento no disponible (modo privado estricto, políticas del navegador)
  }
}

export function getAccessToken(): string | null {
  return read(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  try {
    window.sessionStorage.setItem(ACCESS_KEY, access);
    window.sessionStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // Sin almacenamiento la sesión dura lo que dure la página
  }
}

export function clearTokens(): void {
  try {
    window.sessionStorage.removeItem(ACCESS_KEY);
    window.sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // Nada que borrar
  }
}

export function hasStoredSession(): boolean {
  return getAccessToken() !== null && getRefreshToken() !== null;
}
