import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/sd/shell";
import { DEV_PREVIEW_USER } from "@/dev/preview-user";
import { visibleMenu } from "@/lib/navigation";

// TODO(1.5): sustituir DEV_PREVIEW_USER por la sesión real y agregar las guardas de ruta
export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  return (
    <AppShell
      user={DEV_PREVIEW_USER}
      items={visibleMenu(DEV_PREVIEW_USER)}
      onLogout={() => void navigate({ to: "/login" })}
    >
      <Outlet />
    </AppShell>
  );
}
