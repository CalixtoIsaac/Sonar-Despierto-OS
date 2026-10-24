# ADR-0007: Autenticación y manejo de sesión en el MVP local

- **Estado:** Aceptado · Modificado por [ADR-0009](0009-stack-node-express-sqlite-como-sema.md) (2026-10-23): un solo token de 8 h con `token_version` (sin refresh); el resto sigue vigente
- **Fecha:** 2026-10-17
- **Decisores:** Líder técnico (propuesta incluida en el plan de la Fase 1, aprobada con la hoja de ruta)
- **Relacionado con:** `API_Spec.md` §1.2 y §3.1 (ajusta tiempos y respuestas), ADR-0003, ADR-0004

## Contexto

- Se usan PCs de oficina **compartidas** y, en modo LAN, varias PCs acceden a un mismo servidor.
- No hay correo electrónico configurado para recuperar contraseñas.
- La especificación original definía *refresh tokens* de 7 días y `change-password` con respuesta `204`.

## Decisión

1. **JWT firmado HS256** con PyJWT. Contraseñas con **bcrypt** (cost 12), usando la librería `bcrypt` directamente (`passlib` ya no recibe mantenimiento).
2. **Tokens:**
   - `access_token`: 30 minutos; `refresh_token`: **12 horas** (una jornada de trabajo).
   - Claims: `sub` (id del usuario como texto), `role`, `type` (`access` | `refresh`), `ver` (= `users.token_version`), `iat`, `exp`.
   - En cada petición se verifica en la BD que el usuario exista, esté activo y que `ver` coincida con `token_version`.
3. **Revocación sencilla con `token_version`:** `logout` y `change-password` incrementan `users.token_version`, lo que invalida de inmediato todos los tokens anteriores del usuario (en todas las PCs).
4. `POST /auth/refresh` **rota** el par de tokens.
5. `POST /auth/change-password` responde **200 con un nuevo par de tokens** (en lugar de `204`) para que la sesión actual continúe tras invalidar las anteriores.
6. **Contraseña temporal obligatoria:** si `must_change_password = true`, el backend responde `403 PASSWORD_CHANGE_REQUIRED` a todo excepto `GET /auth/me`, `POST /auth/change-password` y `POST /auth/logout`.
7. **Administrador inicial:** si la BD no tiene usuarios, se crea un `ADMIN` con `FIRST_ADMIN_EMAIL` y la contraseña de `FIRST_ADMIN_PASSWORD` o, si está vacía, una **contraseña aleatoria** escrita en `{DATA_DIR}/CREDENCIALES_INICIALES.txt` (nunca en los logs). El archivo se borra automáticamente cuando ese administrador cambia su contraseña.
8. **Recuperación de acceso:** `SonarDespierto.exe --reset-admin [--email X]` genera una contraseña temporal para el administrador (requiere acceso físico a la PC anfitriona).
9. **Límite de intentos de login:** 5 fallos en 15 minutos por par (IP, correo) → `429 TOO_MANY_REQUESTS` con cabecera `Retry-After`. Se implementa **en memoria** (válido para un proceso único; en la nube se moverá a la BD o a Redis).
10. **Frontend:** los tokens se guardan en `sessionStorage` (se borran al cerrar la pestaña); renovación automática y única ante un `401` de token expirado o inválido.
11. Bitácora (`audit_logs`): `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET`. Nunca se registran contraseñas ni tokens.

## Consecuencias

- ✅ Sesiones cortas, adecuadas para PCs compartidas; cerrar sesión es efectivo de inmediato.
- ✅ Sin dependencia de correo para operar.
- ⚠️ `logout` cierra la sesión del usuario en **todas** sus PCs (comportamiento aceptado y documentado).
- ⚠️ Rotar el refresh token sin lista negra no evita reutilizar un refresh robado antes de que expire; aceptable en la red local de la oficina. En la nube se evaluará una tabla `refresh_tokens` (ya prevista en `Modelo_Datos.md` §5) y cookies `HttpOnly`.
- 🔧 Trabajo generado: subtareas 1.3 y 1.5.

## Alternativas consideradas

- **Sesiones de servidor con cookie:** viable, pero JWT ya estaba especificado y facilita la futura API pública.
- **Refresh de 7 días:** descartado por las PCs compartidas.
