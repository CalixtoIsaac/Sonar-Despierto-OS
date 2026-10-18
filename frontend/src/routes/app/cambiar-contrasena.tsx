import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/sd/ui";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { usePageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/app/cambiar-contrasena")({
  component: ChangePassword,
});

function ChangePassword() {
  usePageTitle("Cambiar contraseña");
  return (
    <>
      <PageHeader title="Cambiar contraseña" />
      <Panel className="max-w-xl">
        <ChangePasswordForm
          onSubmit={async () => {
            // TODO(1.5): conectar con POST /api/v1/auth/change-password
            toast.info("La conexión con el servidor se habilita en la subtarea 1.5");
          }}
        />
      </Panel>
    </>
  );
}
