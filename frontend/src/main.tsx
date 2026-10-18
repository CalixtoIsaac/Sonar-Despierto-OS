// Fuentes locales (sin Google Fonts: el sistema funciona sin internet)
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "@fontsource/jost/300.css";
import "@fontsource/jost/400.css";
import "@fontsource/playfair-display/600-italic.css";
import "./styles.css";

import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Splash } from "@/components/sd/splash";
import { AuthProvider, useAuth } from "@/lib/auth/auth-context";
import { createAppRouter, queryClient } from "./router";

const router = createAppRouter();

function InnerApp() {
  const auth = useAuth();
  useEffect(() => {
    void router.invalidate(); // reevalúa las guardas al cambiar la sesión
  }, [auth.status, auth.user]);
  if (auth.status === "loading") return <Splash />;
  return <RouterProvider router={router} context={{ auth }} />;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("No se encontró el elemento #root");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
