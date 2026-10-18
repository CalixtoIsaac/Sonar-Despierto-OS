import { NAV_ITEMS, visibleMenu } from "@/lib/navigation";

const labels = (items: ReturnType<typeof visibleMenu>) => items.map((i) => i.label);

describe("visibleMenu", () => {
  it("ADMIN ve los 13 elementos", () => {
    const items = visibleMenu({ role: "ADMIN", modules: [], must_change_password: false });
    expect(items).toHaveLength(13);
    expect(items).toEqual(NAV_ITEMS);
  });

  it("OPERADOR con CARTAS ve solo Inicio, Cartas, Búsqueda y Mi perfil", () => {
    const items = visibleMenu({
      role: "OPERADOR",
      modules: ["CARTAS"],
      must_change_password: false,
    });
    expect(labels(items)).toEqual(["Inicio", "Cartas", "Búsqueda por código", "Mi perfil"]);
  });

  it("OPERADOR sin módulos ve Inicio y Mi perfil", () => {
    const items = visibleMenu({ role: "OPERADOR", modules: [], must_change_password: false });
    expect(labels(items)).toEqual(["Inicio", "Mi perfil"]);
  });

  it("OPERADOR nunca ve Usuarios", () => {
    const items = visibleMenu({
      role: "OPERADOR",
      modules: ["VOLUNTARIOS", "BENEFICIARIOS", "EVENTOS", "CARTAS"],
      must_change_password: false,
    });
    expect(labels(items)).not.toContain("Usuarios");
  });

  it("con cambio de contraseña pendiente el menú está vacío", () => {
    expect(visibleMenu({ role: "ADMIN", modules: [], must_change_password: true })).toEqual([]);
  });
});
