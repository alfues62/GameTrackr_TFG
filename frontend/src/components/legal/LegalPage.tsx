import type { ReactNode } from "react";

/**
 * Envoltorio de las páginas legales: título, fecha de actualización y un bloque
 * de prosa con estilos consistentes (encabezados, listas y enlaces).
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-neutral-400">Última actualización: julio de 2026</p>
      </div>
      <div className="space-y-4 leading-relaxed text-neutral-600 [&_a:hover]:underline [&_a]:font-medium [&_a]:text-accent [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-neutral-900 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
