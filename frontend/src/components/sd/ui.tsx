import { useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LETTER_STATUS_LABEL, type LetterStatus } from "@/lib/domain/letters";

export function Logo({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const s = { sm: 34, md: 44, lg: 84 }[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg width={s} height={s * 0.7} viewBox="0 0 100 70" aria-hidden className="shrink-0">
        <path
          d="M8 64 C 9 30, 30 8, 50 8 C 72 7, 92 30, 92 64"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M22 64 C 22 40, 35 22, 50 22 C 66 21, 78 40, 78 64"
          fill="none"
          stroke="var(--secondary)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M36 64 C 36 50, 42 37, 50 37 C 59 36, 64 50, 64 64"
          fill="none"
          stroke="var(--sun)"
          strokeWidth="9"
          strokeLinecap="round"
        />
      </svg>
      <div className="leading-none">
        <div
          className={cn(
            "font-display font-black",
            size === "lg" ? "text-4xl" : size === "md" ? "text-xl" : "text-lg",
          )}
        >
          Soñar
        </div>
        <div
          className={cn(
            "font-geo font-light uppercase tracking-[0.3em]",
            size === "lg" ? "text-lg mt-1" : "text-[0.62rem] mt-0.5",
          )}
        >
          Despierto
        </div>
        <div
          className={cn("font-serif italic text-primary", size === "lg" ? "text-2xl" : "text-sm")}
        >
          Veracruz
        </div>
      </div>
    </div>
  );
}

const chipCls: Record<LetterStatus, string> = {
  PENDIENTE: "bg-st-pendiente",
  ASIGNADO: "bg-st-padrino",
  RECIBIDO: "bg-st-recibido",
  ENTREGADO: "bg-st-entregado",
};
export function StatusChip({ status, className }: { status: LetterStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-foreground whitespace-nowrap",
        chipCls[status],
        className,
      )}
    >
      {LETTER_STATUS_LABEL[status]}
    </span>
  );
}

export function Pill({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "ok" | "warn" | "bad" | "sun";
  children: ReactNode;
}) {
  const t = {
    muted: "bg-st-pendiente",
    ok: "bg-success-soft",
    warn: "bg-warning-soft",
    bad: "bg-primary/15",
    sun: "bg-st-recibido",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap",
        t,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {desc && <p className="mt-1 text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  className,
  children,
  title,
  action,
}: {
  className?: string;
  children: ReactNode;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 sm:p-5", className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "coral" | "orange" | "sun" | "ok";
}) {
  const bar = { coral: "bg-primary", orange: "bg-secondary", sun: "bg-sun", ok: "bg-success" }[
    tone ?? "coral"
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-4">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", bar)} />
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl font-black">{value}</div>
      {hint && <div className="text-sm text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Envuelve listados: skeleton al cargar, error con "Reintentar", vacío o el contenido. */
export function DataState({
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyText,
  emptyAction,
  errorText = "No pudimos cargar la información.",
  children,
}: {
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyText: string;
  emptyAction?: ReactNode;
  errorText?: string;
  children: ReactNode;
}) {
  if (isLoading)
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  if (isError)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
        <AlertTriangle className="size-8 text-primary" />
        <p className="font-semibold">{errorText}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw /> Reintentar
          </Button>
        )}
      </div>
    );
  if (isEmpty)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
        <Inbox className="size-9 text-secondary" />
        <p className="font-semibold">{emptyText}</p>
        {emptyAction}
      </div>
    );
  return <>{children}</>;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  withComment,
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  withComment?: boolean;
  destructive?: boolean;
  onConfirm: (comment: string) => void | Promise<void>;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-base text-foreground/80">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        {children}
        {withComment && (
          <div className="space-y-2">
            <Label htmlFor="cm">Comentario (opcional)</Label>
            <Textarea
              id="cm"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Agrega una nota para el historial"
            />
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                // Si onConfirm lanza, el modal sigue abierto (quien llama muestra el toast)
                await onConfirm(comment);
                onOpenChange(false);
                setComment("");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export function SegProgress({ counts }: { counts: Record<LetterStatus, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const order: LetterStatus[] = ["ENTREGADO", "RECIBIDO", "ASIGNADO", "PENDIENTE"];
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full border">
        {order.map((s) => (
          <div
            key={s}
            className={cn(chipCls[s], "h-full")}
            style={{ width: `${(counts[s] / total) * 100}%` }}
            title={LETTER_STATUS_LABEL[s]}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {order.map((s) => (
          <span key={s} className="inline-flex items-center gap-2 text-sm">
            <StatusChip status={s} /> <b>{counts[s]}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
