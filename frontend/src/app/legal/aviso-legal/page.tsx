import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = { title: "Aviso legal · GameTrackr" };

export default function AvisoLegalPage() {
  return (
    <LegalPage title="Aviso legal">
      <p>
        GameTrackr es un proyecto personal sin ánimo de lucro para la gestión de bibliotecas
        de videojuegos. Este aviso recoge la información general del sitio.
      </p>

      <h2>Titularidad</h2>
      <p>
        El sitio y su código son obra de su autor. Las marcas, logotipos y nombres de
        videojuegos, así como de Steam y PlayStation, pertenecen a sus respectivos
        titulares y se usan únicamente con fines identificativos.
      </p>

      <h2>Contenido de terceros</h2>
      <p>
        Los datos y las imágenes de los juegos se obtienen de{" "}
        <a href="https://www.igdb.com" target="_blank" rel="noreferrer">IGDB</a> y de las
        APIs oficiales de cada plataforma. GameTrackr no reclama la propiedad de dicho contenido.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        Se procura que la información mostrada sea correcta, pero puede contener
        imprecisiones provenientes de las fuentes externas. El uso del servicio es
        responsabilidad del usuario.
      </p>
    </LegalPage>
  );
}
