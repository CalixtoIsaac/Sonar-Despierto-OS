// TEMPORAL: usuario de vista previa mientras no hay sesión real. La subtarea 1.5 elimina este archivo.
import type { UserMe } from "@/lib/api/types";
import { MODULE_KEYS } from "@/lib/domain/access";

export const DEV_PREVIEW_USER: UserMe = {
  id: 0,
  email: "vista.previa@sonardespierto.org",
  first_name: "Vista",
  last_name: "Previa",
  role: "ADMIN",
  is_active: true,
  must_change_password: false,
  modules: [...MODULE_KEYS],
  last_login_at: null,
};
