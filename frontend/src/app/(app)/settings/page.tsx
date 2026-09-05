import { redirect } from "next/navigation";

// La antigua pantalla de Ajustes se fusionó con el perfil. Se mantiene la ruta
// como redirección para no romper enlaces/marcadores antiguos.
export default function SettingsRedirect() {
  redirect("/profile");
}
