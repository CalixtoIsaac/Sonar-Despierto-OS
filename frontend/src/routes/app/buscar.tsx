import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";

export const Route = createFileRoute("/app/buscar")({
  component: () => <ModulePlaceholder module="CARTAS" title="Búsqueda por código" />,
});
