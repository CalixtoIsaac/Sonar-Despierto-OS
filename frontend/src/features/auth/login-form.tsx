import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Escribe tu correo electrónico.")
    .email("Escribe un correo electrónico válido."),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export type LoginValues = z.infer<typeof loginSchema>;

/** Formulario de inicio de sesión. No conoce la API: quien lo usa decide qué hace onSubmit. */
export function LoginForm({ onSubmit }: { onSubmit: (values: LoginValues) => Promise<void> }) {
  const [show, setShow] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    }
  });

  return (
    <form className="mt-8 space-y-5" noValidate onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="login-email" className="text-base">
          Correo electrónico
        </Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="username"
          className="h-12 text-base"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          {...register("email")}
        />
        {errors.email && (
          <p id="login-email-error" className="text-sm font-medium text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password" className="text-base">
          Contraseña
        </Label>
        <div className="relative">
          <Input
            id="login-password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            className="h-12 pr-12 text-base"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "login-password-error" : undefined}
            {...register("password")}
          />
          <button
            type="button"
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShow(!show)}
            className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center"
          >
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        {errors.password && (
          <p id="login-password-error" className="text-sm font-medium text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>
      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 font-medium"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <span>{submitError}</span>
        </div>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />} Iniciar sesión
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        ¿Olvidaste tu contraseña? Contacta al administrador del sistema.
      </p>
    </form>
  );
}
