import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageDropzone } from "./ImageDropzone";
import api from "@/lib/axios";

jest.mock("@/lib/axios", () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const mockedApi = api as unknown as { post: jest.Mock };

beforeEach(() => {
  mockedApi.post.mockReset();
});

describe("ImageDropzone", () => {
  it("sube el fichero seleccionado y devuelve su URL vía onChange", async () => {
    mockedApi.post.mockResolvedValue({
      data: { url: "http://localhost:8000/media/uploads/abc.png" },
    });
    const onChange = jest.fn();
    const { container } = render(<ImageDropzone value={null} onChange={onChange} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["bytes"], "avatar.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith("/api/uploads/", expect.any(FormData)),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("http://localhost:8000/media/uploads/abc.png"),
    );
  });

  it("permite fijar una imagen por URL sin subir ningún fichero", async () => {
    const onChange = jest.fn();
    render(<ImageDropzone value={null} onChange={onChange} />);

    await userEvent.click(screen.getByText(/usar una URL/i));
    await userEvent.type(
      screen.getByPlaceholderText(/URL de la imagen/i),
      "https://ejemplo.com/foto.jpg",
    );
    await userEvent.click(screen.getByRole("button", { name: /^Usar$/i }));

    expect(onChange).toHaveBeenCalledWith("https://ejemplo.com/foto.jpg");
    expect(mockedApi.post).not.toHaveBeenCalled();
  });
});
