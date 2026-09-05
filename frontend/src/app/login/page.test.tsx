import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";

// Mocks de navegación y de NextAuth.
const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const signIn = jest.fn();
jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

function getForm(): HTMLFormElement {
  return screen.getByRole("button", { name: /Entrar/i }).closest("form") as HTMLFormElement;
}

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
  signIn.mockReset();
});

describe("LoginPage errores de login social", () => {
  it("muestra el popup con el motivo cuando llega ?social_error=", () => {
    window.history.replaceState({}, "", "/login?social_error=already_associated");
    render(<LoginPage />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("No se pudo iniciar sesión")).toBeInTheDocument();
    expect(screen.getByText(/ya está vinculada a otro usuario/i)).toBeInTheDocument();
    // La URL queda limpia para que el aviso no reaparezca al recargar.
    expect(window.location.search).toBe("");
    window.history.replaceState({}, "", "/login");
  });
});

describe("LoginPage validación", () => {
  it("rechaza un email con formato inválido y no llama a signIn", async () => {
    render(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText("tucorreo@gmail.com"), "no-es-un-email");
    await userEvent.type(screen.getByPlaceholderText("••••••••••"), "secret123");

    fireEvent.submit(getForm());

    expect(screen.getByText("Introduce un correo electrónico válido.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña vacía y no llama a signIn", async () => {
    render(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText("tucorreo@gmail.com"), "alice@gmail.com");
    // sin contraseña
    fireEvent.submit(getForm());

    expect(screen.getByText("La contraseña es obligatoria.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("con datos válidos llama a signIn con las credenciales", async () => {
    signIn.mockResolvedValue({ ok: true });
    render(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText("tucorreo@gmail.com"), "alice@gmail.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••••"), "secret123");

    fireEvent.submit(getForm());

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "alice@gmail.com",
        password: "secret123",
        redirect: false,
      }),
    );
  });
});
