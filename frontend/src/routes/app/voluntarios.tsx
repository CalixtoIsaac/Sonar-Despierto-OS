import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";

export const Route = createFileRoute("/app/voluntarios")({
  component: () => <ModulePlaceholder module="VOLUNTARIOS" />,
});
