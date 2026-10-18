import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/sd/ui";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { apiFetch } from "@/lib/api/client";
import type { TokenResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { usePageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/app/cambiar-contrasena")({
  component: ChangePassword,
});

function ChangePassword() {
  usePageTitle("Cambiar contraseña");
  const auth = useAuth();
  const navigate = useNavigate();
  const forced = auth.user?.must_change_password ?? false;
  const [changed, setChanged] = useState(false);

  // Se navega cuando el router ya recibió la sesión actualizada; si se navegara en onSubmit,
  // la guarda de /app aún vería must_change_password=true y devolvería a esta página.
  useEffect(() => {
    if (changed && auth.user && !auth.user.must_change_password) void navigate({ to: "/app" });
  }, [changed, auth.user, navigate]);

  return (
    <>
      <PageHeader title="Cambiar contraseña" />
      <Panel className="max-w-xl">
        <ChangePasswordForm
          forced={forced}
          onSubmit={async (body) => {
            const response = await apiFetch<TokenResponse>("/auth/change-password", {
              method: "POST",
              body,
            });
            auth.applyTokenResponse(response);
            toast.success("Contraseña actualizada");
            setChanged(true);
          }}
        />
      </Panel>
    </>
  );
}
