import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = { title: "Cookies · GameTrackr" };

export default function CookiesPage() {
  return (
    <LegalPage title="Política de cookies">
      <p>
        GameTrackr usa el mínimo de cookies imprescindible para funcionar. No utilizamos
        cookies de publicidad ni de seguimiento de terceros.
      </p>

      <h2>Qué cookies usamos</h2>
      <ul>
        <li><strong>Sesión y autenticación:</strong> mantienen tu sesión iniciada de forma segura mientras usas la aplicación.</li>
        <li><strong>Preferencias:</strong> recuerdan pequeños ajustes de tu interfaz (por ejemplo, si prefieres la vista de lista o de cuadrícula).</li>
      </ul>

      <h2>Gestión</h2>
      <p>
        Puedes borrar las cookies desde la configuración de tu navegador en cualquier
        momento. Ten en cuenta que, sin las cookies de sesión, no será posible mantener la
        sesión iniciada.
      </p>
    </LegalPage>
  );
}
