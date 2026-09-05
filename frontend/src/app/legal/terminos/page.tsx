import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = { title: "Términos de uso · GameTrackr" };

export default function TerminosPage() {
  return (
    <LegalPage title="Términos de uso">
      <p>
        Al crear una cuenta en GameTrackr aceptas estas condiciones. Están pensadas para
        que el uso del servicio sea claro y justo para todo el mundo.
      </p>

      <h2>Tu cuenta</h2>
      <p>
        Eres responsable de mantener tu contraseña a salvo y de la actividad de tu cuenta.
        Debes proporcionar un correo electrónico válido al registrarte.
      </p>

      <h2>Uso aceptable</h2>
      <ul>
        <li>No publiques contenido ilegal, ofensivo o que infrinja derechos de terceros.</li>
        <li>No intentes acceder a cuentas ajenas ni alterar el funcionamiento del servicio.</li>
        <li>El contenido que publicas (listas, reseñas, comentarios) es tuyo; nos das permiso para mostrarlo dentro de la aplicación.</li>
      </ul>

      <h2>Disponibilidad</h2>
      <p>
        GameTrackr se ofrece «tal cual». Hacemos lo posible por mantener el servicio
        disponible, pero no garantizamos que esté libre de interrupciones o errores.
      </p>

      <h2>Cambios</h2>
      <p>
        Podemos actualizar estos términos. Si hay cambios relevantes, se reflejarán en la
        fecha de actualización de esta página.
      </p>
    </LegalPage>
  );
}
