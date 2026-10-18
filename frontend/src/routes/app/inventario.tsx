import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";

export const Route = createFileRoute("/app/inventario")({
  component: () => <ModulePlaceholder module="INVENTARIO" />,
});
