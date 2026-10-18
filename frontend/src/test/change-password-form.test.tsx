import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ChangePasswordForm,
  type ChangePasswordValues,
} from "@/features/auth/change-password-form";
import { PASSWORD_POLICY_MESSAGE } from "@/lib/password";

type Submit = (values: ChangePasswordValues) => Promise<void>;

function setup(props: { forced?: boolean; onSubmit?: Submit } = {}) {
  const onSubmit = vi.fn<Submit>(props.onSubmit ?? (() => Promise.resolve()));
  const user = userEvent.setup();
  render(<ChangePasswordForm onSubmit={onSubmit} forced={props.forced ?? false} />);
  const fill = async (current: string, next: string, confirm: string) => {
    if (current) await user.type(screen.getByLabelText("Contraseña actual"), current);
    if (next) await user.type(screen.getByLabelText("Nueva contraseña"), next);
    if (confirm) await user.type(screen.getByLabelText("Confirma la nueva contraseña"), confirm);
    await user.click(screen.getByRole("button", { name: /cambiar contraseña/i }));
  };
  return { onSubmit, fill };
}

describe("ChangePasswordForm", () => {
  it("confirmación distinta muestra error", async () => {
    const { fill, onSubmit } = setup();
    await fill("Temporal123", "NuevaClave1", "OtraClave1");
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("nueva contraseña débil muestra el mensaje de la política", async () => {
    const { fill, onSubmit } = setup();
    await fill("Temporal123", "abcdefgh", "abcdefgh");
    // El mensaje aparece bajo el campo y en el texto de ayuda
    expect(await screen.findAllByText(PASSWORD_POLICY_MESSAGE)).toHaveLength(2);
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("nueva igual a la actual muestra error", async () => {
    const { fill, onSubmit } = setup();
    await fill("Temporal123", "Temporal123", "Temporal123");
    expect(
      await screen.findByText("La nueva contraseña debe ser distinta de la actual."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("datos válidos llaman a onSubmit sin la confirmación", async () => {
    const { fill, onSubmit } = setup();
    await fill("Temporal123", "NuevaClave1", "NuevaClave1");
    expect(onSubmit).toHaveBeenCalledWith({
      current_password: "Temporal123",
      new_password: "NuevaClave1",
    });
  });

  it("muestra el error de onSubmit en role=alert", async () => {
    const { fill } = setup({
      onSubmit: () => Promise.reject(new Error("La contraseña actual no es correcta.")),
    });
    await fill("Incorrecta1", "NuevaClave1", "NuevaClave1");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La contraseña actual no es correcta.",
    );
  });

  it("forced muestra el aviso de contraseña temporal", () => {
    setup({ forced: true });
    expect(
      screen.getByText("Por seguridad, cambia tu contraseña temporal antes de continuar."),
    ).toBeInTheDocument();
  });

  it("sin forced no muestra el aviso", () => {
    setup();
    expect(screen.queryByText(/cambia tu contraseña temporal/)).not.toBeInTheDocument();
  });

  it("muestra la fortaleza como texto", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm onSubmit={() => Promise.resolve()} />);
    expect(screen.getByText("Débil")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nueva contraseña"), "Sueños-Navidad2026");
    expect(screen.getByText("Fuerte")).toBeInTheDocument();
  });
});
