import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";
import { requireModule } from "@/lib/auth/guards";

export const Route = createFileRoute("/app/buscar")({
  beforeLoad: ({ context }) => requireModule(context.auth, "CARTAS"),
  component: () => <ModulePlaceholder module="CARTAS" title="Búsqueda por código" />,
});
