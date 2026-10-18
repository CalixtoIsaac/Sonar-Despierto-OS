import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { NAV_ITEMS } from "@/lib/navigation";
import { routeTree } from "@/routeTree.gen";

function leafRoute(path: string) {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const matches = router.matchRoutes(path, {});
  const leaf = matches[matches.length - 1];
  // globalNotFound existe en tiempo de ejecución, pero no en el tipo público de RouteMatch
  return leaf as (typeof leaf & { globalNotFound?: boolean }) | undefined;
}

const paths = [
  "/login",
  "/app",
  ...NAV_ITEMS.map((item) => item.to),
  "/app/cambiar-contrasena",
  "/app/sin-acceso",
];

describe("rutas", () => {
  it.each([...new Set(paths)])("%s tiene una ruta propia", (path) => {
    const leaf = leafRoute(path);
    expect(leaf).toBeDefined();
    expect(leaf?.routeId).not.toBe("__root__");
    expect(leaf?.globalNotFound).toBeFalsy();
    expect(leaf?.pathname.replace(/\/$/, "")).toBe(path);
  });

  it("una ruta inexistente no tiene ruta propia", () => {
    const leaf = leafRoute("/no-existe");
    expect(leaf?.routeId === "__root__" || leaf?.globalNotFound).toBeTruthy();
  });
});
