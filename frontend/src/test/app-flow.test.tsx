// Flujo completo de la SPA (router + guardas + sesión) con la API simulada.
import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import type { UserMe } from "@/lib/api/types";
import { AuthProvider, useAuth, type AuthContextValue } from "@/lib/auth/auth-context";
import { setTokens } from "@/lib/auth/tokens";
import { routeTree } from "@/routeTree.gen";
import { errorResponse, jsonResponse, makeTokens, makeUser } from "@/test/fixtures";

const fetchMock = vi.fn<typeof fetch>();

function renderApp(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient, auth: undefined as unknown as AuthContextValue },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  // Igual que InnerApp de main.tsx
  function InnerApp() {
    const auth = useAuth();
    useEffect(() => {
      void router.invalidate();
    }, [auth.status, auth.user]);
    if (auth.status === "loading") return <p>Cargando…</p>;
    return <RouterProvider router={router} context={{ auth }} />;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

/** API simulada: responde según la ruta. */
function mockApi(routes: Record<string, () => Response>) {
  fetchMock.mockImplementation((input) => {
    const path = String(input).replace("/api/v1", "");
    const handler = routes[path];
    return Promise.resolve(handler ? handler() : errorResponse(404, "NOT_FOUND", "No existe."));
  });
}

const pathOf = (router: ReturnType<typeof renderApp>) => router.state.location.pathname;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("flujo de la aplicación", () => {
  it("sin sesión, una ruta de /app lleva a /login con redirect", async () => {
    const router = renderApp("/app/cartas");
    await waitFor(() => expect(pathOf(router)).toBe("/login"));
    expect(router.state.location.search).toEqual({ redirect: "/app/cartas" });
    expect(screen.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeInTheDocument();
  });

  it("admin con contraseña temporal: cambio obligatorio y después Inicio", async () => {
    const pending = makeUser({ must_change_password: true });
    const changed: UserMe = { ...pending, must_change_password: false };
    mockApi({
      "/auth/login": () => jsonResponse(200, makeTokens(pending, 1)),
      "/auth/change-password": () => jsonResponse(200, makeTokens(changed, 2)),
    });
    const user = userEvent.setup();
    const router = renderApp("/login");
    await screen.findByRole("heading", { name: "Bienvenido de nuevo" });

    await user.type(screen.getByLabelText("Correo electrónico"), "admin@sonardespierto.org");
    await user.type(screen.getByLabelText("Contraseña"), "Temporal123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => expect(pathOf(router)).toBe("/app/cambiar-contrasena"));
    expect(
      screen.getByText("Por seguridad, cambia tu contraseña temporal antes de continuar."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Menú principal" })).not.toBeInTheDocument();

    // Con el cambio pendiente, cualquier otra ruta regresa al formulario
    await router.navigate({ to: "/app/cartas" });
    await waitFor(() => expect(pathOf(router)).toBe("/app/cambiar-contrasena"));

    await user.type(screen.getByLabelText("Contraseña actual"), "Temporal123");
    await user.type(screen.getByLabelText("Nueva contraseña"), "NuevaClave1");
    await user.type(screen.getByLabelText("Confirma la nueva contraseña"), "NuevaClave1");
    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));

    await waitFor(() => expect(pathOf(router)).toBe("/app"));
    expect(await screen.findByRole("heading", { name: "Hola, Administrador" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menú principal" })).toBeInTheDocument();
  });

  it("operador con CARTAS: menú filtrado y módulo ajeno → Sin acceso", async () => {
    setTokens("access-1", "refresh-1");
    const operator = makeUser({ first_name: "Ana", role: "OPERADOR", modules: ["CARTAS"] });
    mockApi({ "/auth/me": () => jsonResponse(200, operator) });
    const router = renderApp("/app");

    const menu = await screen.findByRole("navigation", { name: "Menú principal" });
    const labels = [...menu.querySelectorAll("a")].map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Inicio", "Cartas", "Búsqueda por código", "Mi perfil"]);

    await router.navigate({ to: "/app/inventario" });
    await waitFor(() => expect(pathOf(router)).toBe("/app/sin-acceso"));
    expect(screen.getByText("Inventario")).toBeInTheDocument();

    await router.navigate({ to: "/app/usuarios" });
    await waitFor(() => expect(pathOf(router)).toBe("/app/sin-acceso"));
  });

  it("con sesión, /login lleva al destino de redirect", async () => {
    setTokens("access-1", "refresh-1");
    mockApi({ "/auth/me": () => jsonResponse(200, makeUser()) });
    const router = renderApp("/login?redirect=%2Fapp%2Fcalendario");
    await waitFor(() => expect(pathOf(router)).toBe("/app/calendario"));
  });

  it("cerrar sesión lleva a /login", async () => {
    setTokens("access-1", "refresh-1");
    mockApi({
      "/auth/me": () => jsonResponse(200, makeUser()),
      "/auth/logout": () => jsonResponse(204),
    });
    const user = userEvent.setup();
    const router = renderApp("/app");
    await screen.findByRole("heading", { name: "Hola, Administrador" });

    await user.click(screen.getByRole("button", { name: /administrador general/i }));
    await user.click(await screen.findByRole("menuitem", { name: /cerrar sesión/i }));

    await waitFor(() => expect(pathOf(router)).toBe("/login"));
    expect(sessionStorage.getItem("sd.access_token")).toBeNull();
  });
});
