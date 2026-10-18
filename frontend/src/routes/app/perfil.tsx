import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel, Pill } from "@/components/sd/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { MODULE_INFO, ROLE_LABEL } from "@/lib/domain/access";
import { usePageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/app/perfil")({
  component: Profile,
});

const lastLoginFormat = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

function Profile() {
  usePageTitle("Mi perfil");
  const { user } = useAuth();
  if (!user) return null;

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
          <dt className="font-semibold text-muted-foreground">Último acceso</dt>
          <dd>
            {user.last_login_at
              ? lastLoginFormat.format(new Date(user.last_login_at))
              : "Este es tu primer acceso"}
          </dd>
        </dl>
      </Panel>
    </>
  );
}
