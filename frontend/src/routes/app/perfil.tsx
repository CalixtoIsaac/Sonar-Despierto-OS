import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel, Pill } from "@/components/sd/ui";
import { DEV_PREVIEW_USER } from "@/dev/preview-user";
import { MODULE_INFO, ROLE_LABEL } from "@/lib/domain/access";
import { usePageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/app/perfil")({
  component: Profile,
});

function Profile() {
  usePageTitle("Mi perfil");
  const user = DEV_PREVIEW_USER; // TODO(1.5): usuario de la sesión

  return (
    <>
      <PageHeader
        title="Mi perfil"
        desc="Datos de tu cuenta. Solo el administrador puede cambiarlos."
      />
      <Panel className="max-w-2xl">
        <dl className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <dt className="font-semibold text-muted-foreground">Nombre</dt>
          <dd>
            {user.first_name} {user.last_name}
          </dd>
          <dt className="font-semibold text-muted-foreground">Correo</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="font-semibold text-muted-foreground">Rol</dt>
          <dd>{ROLE_LABEL[user.role]}</dd>
          <dt className="font-semibold text-muted-foreground">Módulos</dt>
          <dd className="flex flex-wrap gap-2">
            {user.modules.length === 0 ? (
              <span className="text-muted-foreground">Sin módulos asignados</span>
            ) : (
              user.modules.map((m) => <Pill key={m}>{MODULE_INFO[m].label}</Pill>)
            )}
          </dd>
        </dl>
      </Panel>
    </>
  );
}
