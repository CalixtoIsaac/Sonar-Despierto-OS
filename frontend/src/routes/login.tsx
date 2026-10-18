import { createFileRoute, redirect } from "@tanstack/react-router";
import { Logo } from "@/components/sd/ui";
import { LoginForm } from "@/features/auth/login-form";
import { useAuth } from "@/lib/auth/auth-context";
import { safeRedirect } from "@/lib/auth/guards";
import { usePageTitle } from "@/lib/page-title";

interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  beforeLoad: ({ context, search }) => {
    // Con sesión no se muestra el login. Tras iniciar sesión, router.invalidate() pasa por aquí
    if (context.auth.isAuthenticated) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: Login,
});

function Login() {
  usePageTitle("Iniciar sesión");
  const auth = useAuth();

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
          {/* Los errores de la API (401, 403, 429, red) llegan como ApiError y se muestran tal cual */}
          <LoginForm
            onSubmit={async ({ email, password }) => {
              await auth.login(email, password);
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
