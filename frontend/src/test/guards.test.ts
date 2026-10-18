import { isRedirect } from "@tanstack/react-router";
import type { UserMe } from "@/lib/api/types";
import type { AuthContextValue } from "@/lib/auth/auth-context";
import { requireAdmin, requireAuth, requireModule, safeRedirect } from "@/lib/auth/guards";
import { makeUser } from "@/test/fixtures";

function authWith(user: UserMe | null): AuthContextValue {
  return {
    status: user ? "authenticated" : "anonymous",
    user,
    isAuthenticated: user !== null,
    isAdmin: user?.role === "ADMIN",
    hasModule: (m) => user?.modules.includes(m) ?? false,
    login: vi.fn(),
    logout: vi.fn(),
    reloadUser: vi.fn(),
    applyTokenResponse: vi.fn(),
  };
}

/** Ejecuta la guarda y devuelve las opciones del redirect que lanza (o null si deja pasar). */
function redirectOf(guard: () => void): Record<string, unknown> | null {
  try {
    guard();
    return null;
  } catch (error) {
    if (!isRedirect(error)) throw error;
    return error.options as Record<string, unknown>;
  }
}

const location = (pathname: string) => ({ pathname, href: pathname });
const operator = makeUser({ role: "OPERADOR", modules: ["CARTAS"] });

describe("safeRedirect", () => {
  it.each(["/app", "/app/cartas", "/app/sin-acceso?modulo=CARTAS"])("acepta %s", (target) => {
    expect(safeRedirect(target)).toBe(target);
  });

  it.each([["https://x.com"], ["//x"], ["/login"], ["/application"], [undefined], [""]])(
    "rechaza %s",
    (target) => {
      expect(safeRedirect(target)).toBe("/app");
    },
  );
});

describe("requireAuth", () => {
  it("anónimo → /login con redirect", () => {
    const options = redirectOf(() =>
      requireAuth(authWith(null), { pathname: "/app/cartas", href: "/app/cartas?x=1" }),
    );
    expect(options).toMatchObject({ to: "/login", search: { redirect: "/app/cartas?x=1" } });
  });

  it("con sesión deja pasar", () => {
    expect(redirectOf(() => requireAuth(authWith(makeUser()), location("/app/cartas")))).toBeNull();
  });

  it("must_change_password → /app/cambiar-contrasena", () => {
    const auth = authWith(makeUser({ must_change_password: true }));
    expect(redirectOf(() => requireAuth(auth, location("/app/cartas")))).toMatchObject({
      to: "/app/cambiar-contrasena",
    });
  });

  it("must_change_password en la propia página de cambio → deja pasar", () => {
    const auth = authWith(makeUser({ must_change_password: true }));
    expect(redirectOf(() => requireAuth(auth, location("/app/cambiar-contrasena")))).toBeNull();
  });
});

describe("requireModule", () => {
  it("ADMIN pasa siempre", () => {
    expect(redirectOf(() => requireModule(authWith(makeUser()), "INVENTARIO"))).toBeNull();
  });

  it("OPERADOR con el módulo pasa", () => {
    expect(redirectOf(() => requireModule(authWith(operator), "CARTAS"))).toBeNull();
  });

  it("OPERADOR sin el módulo → /app/sin-acceso con el módulo", () => {
    expect(redirectOf(() => requireModule(authWith(operator), "INVENTARIO"))).toMatchObject({
      to: "/app/sin-acceso",
      search: { modulo: "INVENTARIO" },
    });
  });
});

describe("requireAdmin", () => {
  it("ADMIN pasa", () => {
    expect(redirectOf(() => requireAdmin(authWith(makeUser())))).toBeNull();
  });

  it("OPERADOR → /app/sin-acceso", () => {
    expect(redirectOf(() => requireAdmin(authWith(operator)))).toMatchObject({
      to: "/app/sin-acceso",
    });
  });
});
