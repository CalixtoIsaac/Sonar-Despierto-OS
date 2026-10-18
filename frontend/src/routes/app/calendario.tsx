import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/sd/module-placeholder";
import { requireModule } from "@/lib/auth/guards";

export const Route = createFileRoute("/app/calendario")({
  beforeLoad: ({ context }) => requireModule(context.auth, "CALENDARIO"),
  component: () => <ModulePlaceholder module="CALENDARIO" />,
});
