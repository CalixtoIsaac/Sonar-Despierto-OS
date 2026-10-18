import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Logo } from "@/components/sd/ui";
import { LoginForm } from "@/features/auth/login-form";
import { usePageTitle } from "@/lib/page-title";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  usePageTitle("Iniciar sesión");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-sun-gradient p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="w-fit rounded-3xl bg-background/90 p-6 shadow-soft">
          <Logo size="lg" />
        </div>
        <div className="max-w-md rounded-3xl bg-background/90 p-8">
          <p className="font-display text-3xl font-black">“Que ningún niño se quede sin soñar.”</p>
          <p className="mt-4 text-lg">
            Desde 2012 llevamos regalos, alegría y acompañamiento a niñas y niños de escuelas
            públicas de Veracruz en Navidad y Día del Niño.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo size="lg" />
          </div>
          <h1 className="text-3xl">Bienvenido de nuevo</h1>
          <p className="mt-1 text-muted-foreground">Ingresa con tu correo y contraseña.</p>
          <LoginForm
            onSubmit={async () => {
              // TODO(1.5): conectar con POST /api/v1/auth/login
              toast.info("La conexión con el servidor se habilita en la subtarea 1.5");
            }}
          />
          <div className="mt-8 rounded-2xl bg-accent p-4 text-center">
            ¿No tienes cuenta? Solicítala al administrador del sistema.
          </div>
        </div>
      </div>
    </div>
  );
}
