import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = { title: "Privacidad · GameTrackr" };

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad">
      <p>
        GameTrackr es una aplicación para seguir y organizar tu biblioteca de
        videojuegos. Aquí te explicamos qué datos guardamos y para qué, en lenguaje claro.
      </p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li><strong>Tu cuenta:</strong> correo electrónico, nombre de usuario y contraseña (siempre cifrada).</li>
        <li><strong>Tu biblioteca:</strong> los juegos que sigues, su estado, horas jugadas, notas y reseñas.</li>
        <li><strong>Cuentas vinculadas:</strong> si conectas Steam o PlayStation, guardamos los identificadores necesarios para importar tu biblioteca. Nunca se muestran a otros usuarios.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <p>
        Solo para que la aplicación funcione: mostrar tu biblioteca, calcular tus
        estadísticas y recomendaciones, y sincronizar con las plataformas que conectes.
        No vendemos tus datos ni los cedemos a terceros con fines publicitarios.
      </p>

      <h2>Datos de terceros</h2>
      <p>
        La información de los juegos (portadas, géneros, fechas) procede de{" "}
        <a href="https://www.igdb.com" target="_blank" rel="noreferrer">IGDB</a>. Las horas
        y logros importados provienen de las APIs de Steam y PlayStation.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes editar tu perfil y desconectar cualquier plataforma cuando quieras desde
        Ajustes. Para eliminar tu cuenta y todos tus datos, contacta con nosotros desde la
        página de <a href="/legal/contacto">contacto</a>.
      </p>
    </LegalPage>
  );
}
