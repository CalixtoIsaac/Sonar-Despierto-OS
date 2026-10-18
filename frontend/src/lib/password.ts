// Espejo de la política de contraseñas del backend (app/core/security.py).

export const PASSWORD_POLICY_MESSAGE =
  "La contraseña debe tener entre 8 y 72 caracteres, al menos una letra y un número.";

const MIN_LENGTH = 8;
const MAX_LENGTH = 72; // límite de bcrypt, en bytes UTF-8

const encoder = new TextEncoder();

export function meetsPasswordPolicy(pw: string): boolean {
  const length = [...pw].length;
  return (
    length >= MIN_LENGTH &&
    length <= MAX_LENGTH &&
    encoder.encode(pw).length <= MAX_LENGTH &&
    /\p{L}/u.test(pw) &&
    /\p{Nd}/u.test(pw)
  );
}

export type PasswordStrength = "debil" | "aceptable" | "fuerte";

export function passwordStrength(pw: string): PasswordStrength {
  if (!meetsPasswordPolicy(pw)) return "debil";
  const isStrong =
    [...pw].length >= 12 &&
    /\p{Lu}/u.test(pw) &&
    /\p{Ll}/u.test(pw) &&
    /\p{Nd}/u.test(pw) &&
    /[^\p{L}\p{Nd}]/u.test(pw);
  return isStrong ? "fuerte" : "aceptable";
}
