import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  countActiveFilters,
  EMPTY_FILTERS,
  filterOptions,
  LibraryFiltersModal,
} from "./LibraryFiltersModal";
import type { UserGame } from "@/lib/types";

function ug(genres: string[], platform: string, id: number): UserGame {
  return {
    id,
    game: { igdb_id: id, title: `Juego ${id}`, genres, platforms: ["PC"] },
    platform,
  } as unknown as UserGame;
}

describe("filterOptions", () => {
  it("recoge géneros y plataformas de la biblioteca, sin repetir y ordenados", () => {
    const opciones = filterOptions([ug(["RPG", "Acción"], "PC", 1), ug(["RPG"], "PS5", 2)]);

    expect(opciones.genres).toEqual(["Acción", "RPG"]);
    expect(opciones.platforms).toEqual(["PC", "PS5"]);
  });

  it("cae a la plataforma del juego cuando la entrada no tiene una propia", () => {
    const sinPlataforma = ug(["RPG"], "", 3);

    expect(filterOptions([sinPlataforma]).platforms).toEqual(["PC"]);
  });
});

describe("countActiveFilters", () => {
  it("no cuenta nada con los filtros vacíos", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it("suma cada criterio, y los múltiples uno por valor", () => {
    expect(
      countActiveFilters({ ...EMPTY_FILTERS, text: "sky", genres: ["RPG", "Acción"], yearFrom: "2010" }),
    ).toBe(4);
  });

  it("ignora un texto que solo son espacios", () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, text: "   " })).toBe(0);
  });
});

describe("LibraryFiltersModal", () => {
  const opciones = { genres: ["RPG", "Shooter"], platforms: ["PC"] };

  it("solo aplica los cambios al pulsar Aplicar", async () => {
    const onApply = jest.fn();
    render(
      <LibraryFiltersModal
        value={EMPTY_FILTERS}
        options={opciones}
        onApply={onApply}
        onClose={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "RPG" }));
    expect(onApply).not.toHaveBeenCalled(); // trastear no reordena la lista

    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ genres: ["RPG"] }));
  });

  it("descarta el borrador al cancelar", async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    render(
      <LibraryFiltersModal value={EMPTY_FILTERS} options={opciones} onApply={onApply} onClose={onClose} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Shooter" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Limpiar filtros deja el borrador a cero", async () => {
    const onApply = jest.fn();
    render(
      <LibraryFiltersModal
        value={{ ...EMPTY_FILTERS, genres: ["RPG"], yearFrom: "2015" }}
        options={opciones}
        onApply={onApply}
        onClose={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(onApply).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});
