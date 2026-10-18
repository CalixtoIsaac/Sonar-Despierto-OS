import { meetsPasswordPolicy, passwordStrength } from "@/lib/password";

describe("meetsPasswordPolicy", () => {
  it.each(["Segura123", "abcdefg1", "contraseña9", "a1".repeat(36)])("acepta %s", (pw) => {
    expect(meetsPasswordPolicy(pw)).toBe(true);
  });

  it.each([
    ["muy corta", "abc"],
    ["sin números", "abcdefgh"],
    ["sin letras", "12345678"],
    ["73 caracteres", "a1" + "x".repeat(71)],
    ["más de 72 bytes", "ñ1".repeat(25)],
  ])("rechaza (%s)", (_motivo, pw) => {
    expect(meetsPasswordPolicy(pw)).toBe(false);
  });
});

describe("passwordStrength", () => {
  it("débil si no cumple la política", () => {
    expect(passwordStrength("abc")).toBe("debil");
  });

  it("aceptable si cumple pero es corta o sin variedad", () => {
    expect(passwordStrength("Segura123")).toBe("aceptable");
    expect(passwordStrength("segura123segura")).toBe("aceptable");
  });

  it("fuerte con 12+ caracteres, mayúsculas, minúsculas, número y símbolo", () => {
    expect(passwordStrength("Sueños-Navidad2026")).toBe("fuerte");
  });
});
