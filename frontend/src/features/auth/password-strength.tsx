import { passwordStrength, type PasswordStrength as Strength } from "@/lib/password";
import { cn } from "@/lib/utils";

const LEVELS: Record<Strength, { label: string; filled: number; color: string }> = {
  debil: { label: "Débil", filled: 1, color: "bg-primary" },
  aceptable: { label: "Aceptable", filled: 2, color: "bg-secondary" },
  fuerte: { label: "Fuerte", filled: 3, color: "bg-success" },
};

/** Indicador de fortaleza: tres segmentos + texto (nunca solo color). */
export function PasswordStrength({ password }: { password: string }) {
  const level = LEVELS[passwordStrength(password)];
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="grid grid-cols-3 gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn("h-2 rounded-full", i < level.filled ? level.color : "bg-muted")}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Seguridad: <span className="font-semibold text-foreground">{level.label}</span>
      </p>
    </div>
  );
}
