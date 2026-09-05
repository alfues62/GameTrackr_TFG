import { StarIcon } from "@/components/icons";

export function Stars({ rating, className = "" }: { rating: number | null; className?: string }) {
  if (rating == null) return <span className="text-neutral-300">—</span>;
  const filled = Math.max(0, Math.min(5, Math.round(rating / 2)));
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${filled} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon
          key={i}
          filled={i < filled}
          className={`h-3.5 w-3.5 ${i < filled ? "text-accent" : "text-neutral-300"}`}
        />
      ))}
    </span>
  );
}
