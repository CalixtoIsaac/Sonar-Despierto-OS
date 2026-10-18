import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm, type LoginValues } from "@/features/auth/login-form";

type Submit = (values: LoginValues) => Promise<void>;

function setup(impl: Submit = () => Promise.resolve()) {
  const onSubmit = vi.fn<Submit>(impl);
  const user = userEvent.setup();
  render(<LoginForm onSubmit={onSubmit} />);
  return {
    user,
    onSubmit,
    email: screen.getByLabelText("Correo electrónico"),
    password: screen.getByLabelText("Contraseña"),
    submit: screen.getByRole("button", { name: /iniciar sesión/i }),
  };
}

describe("LoginForm", () => {
  it("no precarga credenciales", () => {
    const { email, password } = setup();
    expect(email).toHaveValue("");
    expect(password).toHaveValue("");
  });

  it("enviar vacío muestra errores de campo y no llama a onSubmit", async () => {
    const { user, submit, onSubmit, email } = setup();
    await user.click(submit);
    expect(await screen.findByText("Escribe tu correo electrónico.")).toBeInTheDocument();
    expect(screen.getByText("Escribe tu contraseña.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-describedby", "login-email-error");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("correo inválido muestra error", async () => {
    const { user, email, password, submit, onSubmit } = setup();
    await user.type(email, "no-es-correo");
    await user.type(password, "Clave1234");
    await user.click(submit);
    expect(await screen.findByText("Escribe un correo electrónico válido.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("datos válidos llaman a onSubmit con email y password", async () => {
    const { user, email, password, submit, onSubmit } = setup();
    await user.type(email, "admin@sonardespierto.org");
    await user.type(password, "Clave1234");
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      email: "admin@sonardespierto.org",
      password: "Clave1234",
    });
  });

  it("muestra el error de onSubmit en role=alert", async () => {
    const { user, email, password, submit } = setup(() =>
      Promise.reject(new Error("Correo o contraseña incorrectos.")),
    );
    await user.type(email, "admin@sonardespierto.org");
    await user.type(password, "Incorrecta1");
    await user.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
  });

  it("el botón mostrar/ocultar cambia el tipo del campo", async () => {
    const { user, password } = setup();
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(password).toHaveAttribute("type", "password");
  });
});
