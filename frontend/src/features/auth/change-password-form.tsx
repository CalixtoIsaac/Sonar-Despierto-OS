import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrength } from "@/features/auth/password-strength";
import { meetsPasswordPolicy, PASSWORD_POLICY_MESSAGE } from "@/lib/password";

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Escribe tu contraseña actual."),
    new_password: z.string().refine(meetsPasswordPolicy, PASSWORD_POLICY_MESSAGE),
    confirm_password: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.confirm_password !== values.new_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm_password"],
        message: "Las contraseñas no coinciden.",
      });
    }
    if (values.current_password && values.new_password === values.current_password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["new_password"],
        message: "La nueva contraseña debe ser distinta de la actual.",
      });
    }
  });

type FormValues = z.infer<typeof changePasswordSchema>;
export type ChangePasswordValues = { current_password: string; new_password: string };

const FIELDS = [
  { name: "current_password", label: "Contraseña actual", autoComplete: "current-password" },
  { name: "new_password", label: "Nueva contraseña", autoComplete: "new-password" },
  { name: "confirm_password", label: "Confirma la nueva contraseña", autoComplete: "new-password" },
] as const;

/** Formulario de cambio de contraseña. No conoce la API: quien lo usa decide qué hace onSubmit. */
export function ChangePasswordForm({
  onSubmit,
  forced,
}: {
  onSubmit: (values: ChangePasswordValues) => Promise<void>;
  forced?: boolean;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const submit = handleSubmit(async ({ current_password, new_password }) => {
    setSubmitError(null);
    try {
      await onSubmit({ current_password, new_password });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "No se pudo cambiar la contraseña.");
    }
  });

  return (
    <form className="space-y-5" noValidate onSubmit={submit}>
      {forced && (
        <div className="flex items-start gap-3 rounded-2xl bg-warning-soft p-4 font-medium">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>Por seguridad, cambia tu contraseña temporal antes de continuar.</p>
        </div>
      )}
      {FIELDS.map((field) => {
        const error = errors[field.name];
        const id = `cp-${field.name}`;
        return (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={id} className="text-base">
              {field.label}
            </Label>
            <Input
              id={id}
              type="password"
              autoComplete={field.autoComplete}
              className="h-12 text-base"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              {...register(field.name)}
            />
            {field.name === "new_password" && <PasswordStrength password={watch("new_password")} />}
            {error && (
              <p id={`${id}-error`} className="text-sm font-medium text-destructive">
                {error.message}
              </p>
            )}
          </div>
        );
      })}
      <p className="text-sm text-muted-foreground">{PASSWORD_POLICY_MESSAGE}</p>
      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 font-medium"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <span>{submitError}</span>
        </div>
      )}
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />} Cambiar contraseña
      </Button>
    </form>
  );
}
