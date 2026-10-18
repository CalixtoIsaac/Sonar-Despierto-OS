import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/sd/shell";
import { useAuth } from "@/lib/auth/auth-context";
import { requireAuth } from "@/lib/auth/guards";
import { visibleMenu } from "@/lib/navigation";

export const Route = createFileRoute("/app")({
  beforeLoad: ({ context, location }) => requireAuth(context.auth, location),
  component: AppLayout,
});

function AppLayout() {
  const auth = useAuth();
  // La guarda garantiza la sesión; si se cierra, router.invalidate() redirige a /login
  if (!auth.user) return null;
  return (
    <AppShell user={auth.user} items={visibleMenu(auth.user)} onLogout={() => void auth.logout()}>
      <Outlet />
    </AppShell>
  );
}
