import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";
import { requireModule } from "@/lib/auth/guards";

export const Route = createFileRoute("/app/inventario")({
  beforeLoad: ({ context }) => requireModule(context.auth, "INVENTARIO"),
  component: () => <ModulePlaceholder module="INVENTARIO" />,
});
