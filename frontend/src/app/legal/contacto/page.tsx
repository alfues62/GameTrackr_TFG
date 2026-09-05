import { LegalPage } from "@/components/legal/LegalPage";

export const metadata = { title: "Contacto · GameTrackr" };

export default function ContactoPage() {
  return (
    <LegalPage title="Contacto">
      <p>
        GameTrackr es un proyecto personal. Si tienes dudas, sugerencias o quieres solicitar
        la eliminación de tu cuenta, estamos preparando un canal de contacto.
      </p>
      <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
        Método de contacto pendiente de definir.
      </p>
    </LegalPage>
  );
}
