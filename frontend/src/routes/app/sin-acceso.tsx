import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Panel } from "@/components/sd/ui";
import { Button } from "@/components/ui/button";
import { MODULE_INFO, MODULE_KEYS, type ModuleKey } from "@/lib/domain/access";
import { usePageTitle } from "@/lib/page-title";

interface NoAccessSearch {
  modulo?: string;
}

export const Route = createFileRoute("/app/sin-acceso")({
  validateSearch: (search: Record<string, unknown>): NoAccessSearch =>
    typeof search["modulo"] === "string" ? { modulo: search["modulo"] } : {},
  component: NoAccess,
});

function isModuleKey(value: string | undefined): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value ?? "");
}

function NoAccess() {
  usePageTitle("Sin acceso");
  const { modulo } = Route.useSearch();
  const label = isModuleKey(modulo) ? MODULE_INFO[modulo].label : undefined;

  return (
    <Panel className="mx-auto mt-6 max-w-xl">
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Lock className="size-7 text-primary" aria-hidden />
        </span>
        <h1 className="text-2xl">No tienes acceso a este módulo</h1>
        <p className="text-lg">
          {label ? (
            <>
              No tienes acceso al módulo <b>{label}</b>.{" "}
            </>
          ) : null}
          Pide al administrador que te lo asigne.
        </p>
        <Button asChild size="lg">
          <Link to="/app">Volver al inicio</Link>
        </Button>
      </div>
    </Panel>
  );
}
