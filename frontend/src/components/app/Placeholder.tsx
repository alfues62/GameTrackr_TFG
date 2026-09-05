export function Placeholder({ section }: { section: string }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-accent">{section}</p>
      <h1 className="mt-3 text-3xl font-bold">Próximamente</h1>
      <p className="mt-2 text-neutral-500">Esta sección aún está en construcción.</p>
    </div>
  );
}
