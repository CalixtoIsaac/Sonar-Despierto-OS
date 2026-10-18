import { ApiError, apiFetch, setSessionExpiredHandler } from "@/lib/api/client";
import { getAccessToken, getRefreshToken, setTokens } from "@/lib/auth/tokens";
import { errorResponse, jsonResponse, makeTokens } from "@/test/fixtures";

const fetchMock = vi.fn<typeof fetch>();

function calledUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

function authHeader(callIndex: number): string | undefined {
  const init = fetchMock.mock.calls[callIndex]?.[1];
  return (init?.headers as Record<string, string> | undefined)?.["Authorization"];
}

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setSessionExpiredHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("agrega Authorization cuando hay token", async () => {
    setTokens("access-1", "refresh-1");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await expect(apiFetch("/algo")).resolves.toEqual({ ok: true });
    expect(calledUrls()).toEqual(["/api/v1/algo"]);
    expect(authHeader(0)).toBe("Bearer access-1");
  });

  it("no agrega Authorization con auth:false", async () => {
    setTokens("access-1", "refresh-1");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await apiFetch("/algo", { auth: false });
    expect(authHeader(0)).toBeUndefined();
  });

  it("envía JSON solo cuando hay body", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, {})));
    await apiFetch("/con-body", { method: "POST", body: { a: 1 } });
    await apiFetch("/sin-body");
    const [withBody, withoutBody] = fetchMock.mock.calls.map(([, init]) => init);
    expect(withBody?.body).toBe('{"a":1}');
    expect((withBody?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(withoutBody?.body).toBeNull();
    expect((withoutBody?.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("convierte el cuerpo de error en ApiError", async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(409, "EMAIL_ALREADY_EXISTS", "Ya existe un usuario con ese correo."),
    );
    const error = await apiFetch("/users").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "EMAIL_ALREADY_EXISTS",
      message: "Ya existe un usuario con ese correo.",
    });
  });

  it("error sin cuerpo JSON → HTTP_ERROR con mensaje genérico", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));
    await expect(apiFetch("/algo")).rejects.toMatchObject({
      status: 502,
      code: "HTTP_ERROR",
      message: "Ocurrió un error inesperado.",
    });
  });

  it("401 TOKEN_EXPIRED → renueva, reintenta y devuelve los datos", async () => {
    setTokens("access-1", "refresh-1");
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, "TOKEN_EXPIRED", "Tu sesión expiró."))
      .mockResolvedValueOnce(jsonResponse(200, makeTokens(undefined, 2)))
      .mockResolvedValueOnce(jsonResponse(200, { datos: 42 }));

    await expect(apiFetch("/algo")).resolves.toEqual({ datos: 42 });
    expect(calledUrls()).toEqual(["/api/v1/algo", "/api/v1/auth/refresh", "/api/v1/algo"]);
    expect(authHeader(1)).toBeUndefined(); // el refresh va sin Authorization
    expect(authHeader(2)).toBe("Bearer access-2");
    expect(getAccessToken()).toBe("access-2");
    expect(getRefreshToken()).toBe("refresh-2");
  });

  it("dos peticiones simultáneas con 401 comparten una sola renovación", async () => {
    setTokens("access-1", "refresh-1");
    let releaseRefresh: (r: Response) => void = () => {};
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return new Promise<Response>((resolve) => {
          releaseRefresh = resolve;
        });
      }
      return Promise.resolve(
        getAccessToken() === "access-2"
          ? jsonResponse(200, { url })
          : errorResponse(401, "TOKEN_EXPIRED", "Tu sesión expiró."),
      );
    });

    const both = Promise.all([apiFetch("/a"), apiFetch("/b")]);
    await vi.waitFor(() => expect(calledUrls()).toContain("/api/v1/auth/refresh"));
    releaseRefresh(jsonResponse(200, makeTokens(undefined, 2)));

    await expect(both).resolves.toEqual([{ url: "/api/v1/a" }, { url: "/api/v1/b" }]);
    expect(calledUrls().filter((u) => u.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("refresh fallido → borra tokens, avisa una vez y lanza ApiError", async () => {
    setTokens("access-1", "refresh-1");
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, "TOKEN_EXPIRED", "Tu sesión expiró."))
      .mockResolvedValueOnce(errorResponse(401, "TOKEN_INVALID", "La sesión no es válida."));

    await expect(apiFetch("/algo")).rejects.toMatchObject({ status: 401, code: "TOKEN_EXPIRED" });
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("si el reintento también da 401, no renueva otra vez", async () => {
    setTokens("access-1", "refresh-1");
    fetchMock
      .mockResolvedValueOnce(errorResponse(401, "TOKEN_EXPIRED", "Tu sesión expiró."))
      .mockResolvedValueOnce(jsonResponse(200, makeTokens(undefined, 2)))
      .mockResolvedValueOnce(errorResponse(401, "TOKEN_INVALID", "La sesión no es válida."));

    await expect(apiFetch("/algo")).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    expect(calledUrls().filter((u) => u.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("401 INVALID_CREDENTIALS con auth:false no renueva ni avisa", async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock.mockResolvedValueOnce(
      errorResponse(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos."),
    );

    await expect(
      apiFetch("/auth/login", { method: "POST", body: {}, auth: false }),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Correo o contraseña incorrectos.",
    });
    expect(calledUrls()).toEqual(["/api/v1/auth/login"]);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("notifyOnUnauthorized:false no llama al manejador", async () => {
    setTokens("access-1", "refresh-1");
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock.mockResolvedValueOnce(
      errorResponse(401, "NOT_AUTHENTICATED", "No has iniciado sesión."),
    );
    await expect(apiFetch("/auth/logout", { notifyOnUnauthorized: false })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("fallo de red → NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(apiFetch("/algo")).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
      message:
        "No se pudo conectar con el servidor. Verifica que el programa Soñar Despierto siga abierto.",
    });
  });

  it("204 → undefined", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204));
    await expect(apiFetch("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});
