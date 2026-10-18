// Espejo de los esquemas de la API (Fase 1 §3.7).
import type { ModuleKey, UserRole } from "@/lib/domain/access";

export interface UserMe {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  modules: ModuleKey[];
  last_login_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: UserMe;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown };
}
