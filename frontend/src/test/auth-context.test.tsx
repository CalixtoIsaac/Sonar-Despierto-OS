import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import { getAccessToken, getRefreshToken, setTokens } from "@/lib/auth/tokens";
import { errorResponse, jsonResponse, makeTokens, makeUser } from "@/test/fixtures";

const fetchMock = vi.fn<typeof fetch>();

function renderAuth() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useAuth(), { wrapper });
}

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthProvider", () => {
  it("sin tokens arranca como anónimo sin llamar a la API", () => {
    const { result } = renderAuth();
    expect(result.current.status).toBe("anonymous");
    expect(result.current.isAuthenticated).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con tokens y /auth/me correcto queda autenticado", async () => {
    setTokens("access-1", "refresh-1");
    const user = makeUser({ first_name: "Ana" });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, user));
    const { result } = renderAuth();
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.user).toEqual(user);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/v1/auth/me");
  });

  it("/auth/me con 401 → anónimo y tokens borrados", async () => {
    setTokens("access-1", "refresh-1");
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        String(input).endsWith("/auth/refresh")
          ? errorResponse(401, "TOKEN_INVALID", "La sesión no es válida.")
          : errorResponse(401, "TOKEN_EXPIRED", "Tu sesión expiró."),
      ),
    );
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("anonymous"));
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("login guarda los tokens y expone el usuario", async () => {
    const user = makeUser({ role: "OPERADOR", modules: ["CARTAS"] });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, makeTokens(user, 7)));
    const { result } = renderAuth();

    await act(async () => {
      await expect(result.current.login("ana@sonardespierto.org", "Clave1234")).resolves.toEqual(
        user,
      );
    });
    expect(result.current.status).toBe("authenticated");
    expect(result.current.user).toEqual(user);
    expect(getAccessToken()).toBe("access-7");
    expect(getRefreshToken()).toBe("refresh-7");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBe('{"email":"ana@sonardespierto.org","password":"Clave1234"}');
  });

  it("login fallido propaga el error y sigue anónimo", async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos."),
    );
    const { result } = renderAuth();
    await act(async () => {
      await expect(result.current.login("x@y.org", "mala")).rejects.toMatchObject({
        message: "Correo o contraseña incorrectos.",
      });
    });
    expect(result.current.status).toBe("anonymous");
    expect(getAccessToken()).toBeNull();
  });

  it("logout borra los tokens aunque la API falle", async () => {
    setTokens("access-1", "refresh-1");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, makeUser()))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.status).toBe("anonymous");
    expect(result.current.user).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("applyTokenResponse guarda tokens y usuario", () => {
    const { result } = renderAuth();
    const user = makeUser({ must_change_password: false });
    act(() => result.current.applyTokenResponse(makeTokens(user, 3)));
    expect(result.current.user).toEqual(user);
    expect(getAccessToken()).toBe("access-3");
  });

  it("hasModule e isAdmin", async () => {
    const operator = makeUser({ role: "OPERADOR", modules: ["CARTAS"] });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, makeTokens(operator)));
    const { result } = renderAuth();
    expect(result.current.hasModule("CARTAS")).toBe(false); // sin sesión
    await act(async () => {
      await result.current.login("op@sonardespierto.org", "Clave1234");
    });
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.hasModule("CARTAS")).toBe(true);
    expect(result.current.hasModule("INVENTARIO")).toBe(false);

    act(() => result.current.applyTokenResponse(makeTokens(makeUser({ role: "ADMIN" }))));
    expect(result.current.isAdmin).toBe(true);
  });

  it("useAuth fuera del provider lanza un error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
  });
});
