import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";

export const Route = createFileRoute("/app/escuelas")({
  component: () => <ModulePlaceholder module="BENEFICIARIOS" title="Escuelas" />,
});
