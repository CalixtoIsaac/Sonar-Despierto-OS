import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";

export const Route = createFileRoute("/app/cartas")({
  component: () => <ModulePlaceholder module="CARTAS" />,
});
