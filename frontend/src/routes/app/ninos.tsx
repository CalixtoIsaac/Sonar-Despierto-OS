import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";
import { requireModule } from "@/lib/auth/guards";

export const Route = createFileRoute("/app/ninos")({
  beforeLoad: ({ context }) => requireModule(context.auth, "BENEFICIARIOS"),
  component: () => <ModulePlaceholder module="BENEFICIARIOS" title="Niños" />,
});
