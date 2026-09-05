import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider, useConfirm } from "./ConfirmDialog";

function Subject({ onAnswer }: { onAnswer: (ok: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () =>
        onAnswer(
          await confirm({
            title: "¿Quitar este juego?",
            message: "Se perderán tus horas.",
            confirmLabel: "Quitar",
            tone: "danger",
          }),
        )
      }
    >
      Abrir
    </button>
  );
}

function setup(onAnswer = jest.fn()) {
  render(
    <ConfirmProvider>
      <Subject onAnswer={onAnswer} />
    </ConfirmProvider>,
  );
  return onAnswer;
}

describe("ConfirmDialog", () => {
  it("no muestra nada hasta que se pide confirmación", () => {
    setup();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("muestra el título y el mensaje al pedirla", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("¿Quitar este juego?")).toBeInTheDocument();
    expect(screen.getByText("Se perderán tus horas.")).toBeInTheDocument();
  });

  it("resuelve true al aceptar y cierra el diálogo", async () => {
    const onAnswer = setup();
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await userEvent.click(await screen.findByRole("button", { name: "Quitar" }));

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("resuelve false al cancelar", async () => {
    const onAnswer = setup();
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false));
  });
});
