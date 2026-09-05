import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListModal } from "./ListModal";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import api from "@/lib/axios";

jest.mock("@/lib/axios", () => ({
  __esModule: true,
  default: { post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const mockedApi = api as unknown as { post: jest.Mock; patch: jest.Mock; delete: jest.Mock };

function getForm(): HTMLFormElement {
  return screen.getByRole("button", { name: /^Crear$/i }).closest("form") as HTMLFormElement;
}

beforeEach(() => {
  mockedApi.post.mockReset();
  mockedApi.post.mockResolvedValue({ data: {} });
});

describe("ListModal", () => {
  it("no envía la creación si el nombre está vacío", () => {
    render(
      <ConfirmProvider>
        <ListModal list={null} onClose={jest.fn()} onChanged={jest.fn()} />
      </ConfirmProvider>,
    );
    fireEvent.submit(getForm());
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("crea la lista cuando hay nombre", async () => {
    const onChanged = jest.fn();
    render(
      <ConfirmProvider>
        <ListModal list={null} onClose={jest.fn()} onChanged={onChanged} />
      </ConfirmProvider>,
    );

    await userEvent.type(screen.getByPlaceholderText("Elige un título"), "Para rejugar");
    fireEvent.submit(getForm());

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith(
        "/api/lists/",
        expect.objectContaining({ name: "Para rejugar" }),
      ),
    );
  });
});
