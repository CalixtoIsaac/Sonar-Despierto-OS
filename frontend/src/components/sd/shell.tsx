import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ChevronRight, KeyRound, LogOut, MoreHorizontal, UserCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "./ui";
import type { UserMe } from "@/lib/api/types";
import { ROLE_LABEL } from "@/lib/domain/access";
import type { NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

// Migas de pan: un texto por cada segmento de ruta (Fase 1 §3.9)
const CRUMB: Record<string, string> = {
  app: "Inicio",
  calendario: "Calendario",
  eventos: "Eventos",
  cartas: "Cartas",
  buscar: "Búsqueda",
  ninos: "Niños",
  escuelas: "Escuelas",
  tutores: "Tutores",
  voluntarios: "Voluntarios",
  inventario: "Inventario",
  reportes: "Reportes",
  usuarios: "Usuarios",
  perfil: "Mi perfil",
  "cambiar-contrasena": "Cambiar contraseña",
  "sin-acceso": "Sin acceso",
};

function isActive(path: string, to: string) {
  return to === "/app" ? path === "/app" || path === "/app/" : path.startsWith(to);
}

interface AppShellProps {
  user: Pick<UserMe, "first_name" | "last_name" | "email" | "role">;
  items: NavItem[];
  onLogout: () => void;
  children: ReactNode;
}

export function AppShell({ user, items, onLogout, children }: AppShellProps) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [more, setMore] = useState(false);
  const bottom = items.length > 4 ? items.slice(0, 3) : items;
  const rest = items.length > 4 ? items.slice(3) : [];
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const parts = path.split("/").filter(Boolean);
  const hasNav = items.length > 0;

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Link to="/app" aria-label="Ir al inicio">
            <Logo size="sm" />
          </Link>
          {/* TODO(F4): píldora con el evento activo */}
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-h-11 items-center gap-2 rounded-xl px-2 hover:bg-accent">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                  {(user.first_name || user.email).charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-sm font-semibold">{fullName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ROLE_LABEL[user.role]}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  {fullName}
                  <div className="text-xs font-normal text-muted-foreground">
                    {ROLE_LABEL[user.role]}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="min-h-11">
                  <Link to="/app/perfil">
                    <UserCircle /> Mi perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="min-h-11">
                  <Link to="/app/cambiar-contrasena">
                    <KeyRound /> Cambiar contraseña
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-11 text-primary" onSelect={() => onLogout()}>
                  <LogOut /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {hasNav && (
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r bg-sidebar p-3 lg:block">
            <nav aria-label="Menú principal" className="space-y-1">
              {items.map((it) => (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium hover:bg-sidebar-accent",
                    isActive(path, it.to) && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  <it.icon className="size-5" /> {it.label}
                </Link>
              ))}
            </nav>
          </aside>
        )}
        <main
          className={cn("min-w-0 flex-1 px-4 pt-4 lg:px-8 lg:pb-10", hasNav ? "pb-28" : "pb-10")}
        >
          <nav
            aria-label="Migas de pan"
            className="mb-3 hidden items-center gap-1 text-sm text-muted-foreground lg:flex"
          >
            {parts.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-4" />}
                <span className={i === parts.length - 1 ? "font-semibold text-foreground" : ""}>
                  {CRUMB[p] ?? decodeURIComponent(p)}
                </span>
              </span>
            ))}
          </nav>
          {children}
        </main>
      </div>

      {hasNav && (
        <nav
          aria-label="Navegación inferior"
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-background lg:hidden"
        >
          <div className="grid grid-cols-4">
            {bottom.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold",
                  isActive(path, it.to) ? "text-primary" : "text-foreground",
                )}
              >
                <it.icon className="size-6" /> {it.label.split(" ")[0]}
              </Link>
            ))}
            {rest.length > 0 && (
              <button
                type="button"
                onClick={() => setMore(true)}
                className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold"
              >
                <MoreHorizontal className="size-6" /> Más
              </button>
            )}
          </div>
        </nav>
      )}
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Más opciones</SheetTitle>
          </SheetHeader>
          <div className="grid gap-1 p-2">
            {rest.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                onClick={() => setMore(false)}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium hover:bg-accent"
              >
                <it.icon className="size-5" /> {it.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
