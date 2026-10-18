import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Panel, Pill } from "@/components/sd/ui";
import { DEV_PREVIEW_USER } from "@/dev/preview-user";
import { MODULE_INFO } from "@/lib/domain/access";
import { visibleMenu } from "@/lib/navigation";
import { usePageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/app/")({
  component: Home,
});

function Home() {
  usePageTitle("Inicio");
  const user = DEV_PREVIEW_USER; // TODO(1.5): usuario de la sesión
  const moduleItems = visibleMenu(user).filter((item) => item.module);

  return (
    <>
      <PageHeader
        title={`Hola, ${user.first_name}`}
        desc="Estos son los módulos a los que tienes acceso."
      />
      <Panel title="Tus módulos">
        {moduleItems.length === 0 ? (
          <p className="text-muted-foreground">
            Aún no tienes módulos asignados. Pide al administrador que te los asigne.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {moduleItems.map((item) => {
              const info = item.module ? MODULE_INFO[item.module] : undefined;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex flex-col gap-3 rounded-2xl border bg-background p-4 transition hover:border-primary hover:shadow-soft"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
                      <item.icon className="size-6 text-primary" aria-hidden />
                    </span>
                    <span className="font-display text-lg font-extrabold">{item.label}</span>
                  </span>
                  {info && (
                    <span className="text-sm text-muted-foreground">{info.description}</span>
                  )}
                  {info && (
                    <span>
                      <Pill tone="sun">Próximamente · Fase {info.phase}</Pill>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
