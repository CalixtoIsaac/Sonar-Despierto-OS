import {
  BarChart3,
  Baby,
  Boxes,
  CalendarDays,
  CalendarRange,
  Contact,
  Home,
  Mail,
  ScanSearch,
  School,
  UserCircle,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { UserMe } from "@/lib/api/types";
import type { ModuleKey } from "@/lib/domain/access";

export type AppPath =
  | "/app"
  | "/app/calendario"
  | "/app/eventos"
  | "/app/cartas"
  | "/app/buscar"
  | "/app/ninos"
  | "/app/escuelas"
  | "/app/tutores"
  | "/app/voluntarios"
  | "/app/inventario"
  | "/app/reportes"
  | "/app/usuarios"
  | "/app/perfil";

export interface NavItem {
  to: AppPath;
  label: string;
  icon: LucideIcon;
  module?: ModuleKey;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/app", label: "Inicio", icon: Home },
  { to: "/app/calendario", label: "Calendario", icon: CalendarRange, module: "CALENDARIO" },
  { to: "/app/eventos", label: "Eventos", icon: CalendarDays, module: "EVENTOS" },
  { to: "/app/cartas", label: "Cartas", icon: Mail, module: "CARTAS" },
  { to: "/app/buscar", label: "Búsqueda por código", icon: ScanSearch, module: "CARTAS" },
  { to: "/app/ninos", label: "Niños", icon: Baby, module: "BENEFICIARIOS" },
  { to: "/app/escuelas", label: "Escuelas", icon: School, module: "BENEFICIARIOS" },
  { to: "/app/tutores", label: "Tutores", icon: Contact, module: "BENEFICIARIOS" },
  { to: "/app/voluntarios", label: "Voluntarios", icon: Users, module: "VOLUNTARIOS" },
  { to: "/app/inventario", label: "Inventario", icon: Boxes, module: "INVENTARIO" },
  { to: "/app/reportes", label: "Reportes", icon: BarChart3, module: "REPORTES" },
  { to: "/app/usuarios", label: "Usuarios", icon: UserCog, adminOnly: true },
  { to: "/app/perfil", label: "Mi perfil", icon: UserCircle },
];

/** Menú visible: vacío si debe cambiar contraseña; adminOnly solo ADMIN; módulo solo si lo tiene. */
export function visibleMenu(
  user: Pick<UserMe, "role" | "modules" | "must_change_password">,
): NavItem[] {
  if (user.must_change_password) return [];
  const isAdmin = user.role === "ADMIN";
  return NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.module) return isAdmin || user.modules.includes(item.module);
    return true;
  });
}
