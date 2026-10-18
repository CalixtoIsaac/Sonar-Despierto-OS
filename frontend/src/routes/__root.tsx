import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import type { RouterContext } from "@/router";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-7xl font-black text-primary">404</p>
        <h1 className="mt-4 text-2xl">Página no encontrada</h1>
        <p className="mt-2 text-muted-foreground">
          La página que buscas no existe o cambió de lugar.
        </p>
        <Button asChild size="lg" className="mt-6">
          <Link to="/app">Ir al inicio</Link>
        </Button>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl">Esta página no se pudo cargar</h1>
        <p className="mt-2 text-muted-foreground">
          Ocurrió un problema inesperado. Puedes reintentar o volver al inicio.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            size="lg"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
          >
            Reintentar
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/app">Ir al inicio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      <Toaster richColors position="top-center" />
    </>
  ),
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
