import { createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { PageHeader, Panel, Pill } from "@/components/sd/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { usePageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/app/usuarios")({
  beforeLoad: ({ context }) => requireAdmin(context.auth),
  component: Users,
});

function Users() {
  usePageTitle("Usuarios");
  return (
    <>
      <PageHeader title="Usuarios" />
      <Panel>
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-sun/40">
            <UserCog className="size-7 text-secondary" aria-hidden />
          </span>
          <p className="max-w-lg text-lg">Gestión de usuarios y permisos</p>
          <Pill tone="sun">Próximamente · Fase 2</Pill>
        </div>
      </Panel>
    </>
  );
}
