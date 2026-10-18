import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataState } from "@/components/sd/ui";

describe("DataState", () => {
  it("isLoading muestra el skeleton con aria-busy", () => {
    const { container } = render(
      <DataState isLoading emptyText="Sin datos">
        <p>Contenido</p>
      </DataState>,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText("Contenido")).not.toBeInTheDocument();
  });

  it("isError muestra el mensaje y Reintentar llama a onRetry", async () => {
    const onRetry = vi.fn();
    render(
      <DataState isError onRetry={onRetry} emptyText="Sin datos">
        <p>Contenido</p>
      </DataState>,
    );
    expect(screen.getByText("No pudimos cargar la información.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("isEmpty muestra emptyText", () => {
    render(
      <DataState isEmpty emptyText="Aún no hay cartas registradas.">
        <p>Contenido</p>
      </DataState>,
    );
    expect(screen.getByText("Aún no hay cartas registradas.")).toBeInTheDocument();
    expect(screen.queryByText("Contenido")).not.toBeInTheDocument();
  });

  it("sin estados especiales renderiza children", () => {
    render(
      <DataState emptyText="Sin datos">
        <p>Contenido</p>
      </DataState>,
    );
    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });
});
