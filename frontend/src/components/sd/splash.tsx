import { Loader2 } from "lucide-react";
import { Logo } from "@/components/sd/ui";

/** Pantalla de arranque mientras se restaura la sesión. */
export function Splash() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background"
      aria-busy="true"
    >
      <Logo size="lg" />
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden /> Cargando…
      </p>
    </div>
  );
}
