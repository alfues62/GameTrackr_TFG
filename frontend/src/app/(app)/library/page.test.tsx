import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LibraryPage from "./page";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import api, { fetchAll } from "@/lib/axios";

jest.mock("@/lib/axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  fetchAll: jest.fn(),
}));

// La página usa useAuth (useSession) para filtrar las listas propias.
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "1" } }, status: "authenticated" }),
  signOut: jest.fn(),
}));

const mockedApi = api as unknown as { get: jest.Mock };
const mockedFetchAll = fetchAll as jest.Mock;

function makeUserGame(id: number, title: string, status: string) {
  return {
    id,
    status,
    hours_played: 10,
    user_rating: null,
    review: null,
    platform: "PC",
    is_from_steam: false,
    last_synced: null,
    added_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    game: {
      id,
      igdb_id: 1000 + id,
      title,
      cover_url: null,
      description: null,
      release_date: "2018-01-25",
      genres: ["Plataformas"],
      platforms: ["PC"],
      igdb_rating: 90,
    },
  };
}

const LIBRARY = [
  makeUserGame(1, "Celeste", "playing"),
  makeUserGame(2, "Hades", "completed"),
];

beforeEach(() => {
  // El banner de sync consulta su estado vía api.get.
  mockedApi.get.mockResolvedValue({ data: { status: "idle" } });
  // La página carga biblioteca y listas completas vía fetchAll.
  mockedFetchAll.mockImplementation((url: string) =>
    Promise.resolve(url.includes("/api/library/") ? LIBRARY : [])
  );
});

describe("LibraryPage", () => {
  function renderPage() {
    render(
      <ConfirmProvider>
        <LibraryPage />
      </ConfirmProvider>,
    );
  }

  /** El subtítulo "Lista de estado" solo aparece en las tarjetas del resumen. */
  const enResumen = () => screen.queryAllByText("Lista de estado").length > 0;

  it("arranca en el resumen, con una tarjeta por estado y sin listar juegos", async () => {
    renderPage();

    expect(await screen.findAllByText("Lista de estado")).toHaveLength(5);
    expect(screen.queryByText("Celeste")).not.toBeInTheDocument();
    // El acceso al resumen ya no está en la barra lateral.
    expect(screen.queryByText("Vista general")).not.toBeInTheDocument();
  });

  it("al entrar en un estado se ven solo sus juegos", async () => {
    renderPage();
    await screen.findAllByText("Lista de estado");

    // El primero es el de la barra lateral; el otro, su tarjeta del resumen.
    await userEvent.click(screen.getAllByRole("button", { name: /Jugando/i })[0]);

    expect(screen.getByText("Celeste")).toBeInTheDocument(); // playing
    expect(screen.queryByText("Hades")).not.toBeInTheDocument(); // completed
    expect(enResumen()).toBe(false);
  });

  it("el botón de volver devuelve al resumen", async () => {
    renderPage();
    await screen.findAllByText("Lista de estado");
    await userEvent.click(screen.getAllByRole("button", { name: /Completado/i })[0]);
    expect(screen.getByText("Hades")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Volver/i }));

    expect(enResumen()).toBe(true);
    expect(screen.queryByText("Hades")).not.toBeInTheDocument();
  });
});
