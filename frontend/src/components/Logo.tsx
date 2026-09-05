import Link from "next/link";
import type { SVGProps } from "react";

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 1254 855" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        fill="#EA5B0C"
        d="M90 30h250q22 0 34 17l30 81h361a40 40 0 0 1 40 40v592a40 40 0 0 1-40 40H90a40 40 0 0 1-40-40V70a40 40 0 0 1 40-40Z"
      />
      <path stroke="#fff" strokeWidth={70} d="m265 303 320 320M585 303 265 623" />
      <path
        fill="currentColor"
        d="M838 240c62 0 112-38 162-32 90 10 165 92 192 232 23 115 3 260-57 332-37 44-89 34-123-20-37-58-76-112-128-134-18-8-34-12-46-18Z"
      />
      <circle cx={1000} cy={318} r={27} fill="#fff" />
      <circle cx={938} cy={380} r={27} fill="#fff" />
      <circle cx={1062} cy={380} r={27} fill="#fff" />
      <circle cx={1000} cy={442} r={27} fill="#fff" />
    </svg>
  );
}

const MARK_SIZE = { sm: "h-6", md: "h-7", lg: "h-9" } as const;
const TEXT_SIZE = { sm: "text-sm", md: "text-base", lg: "text-xl" } as const;

export function Logo({
  size = "lg",
  href = "/",
  as = "link",
}: {
  size?: keyof typeof MARK_SIZE;
  href?: string;
  as?: "link" | "div";
}) {
  const content = (
    <>
      <LogoMark className={`${MARK_SIZE[size]} w-auto text-neutral-900 dark:text-neutral-100`} />
      <span className={`${TEXT_SIZE[size]} font-bold tracking-tight`}>
        Game<span className="text-neutral-400">Trackr</span>
      </span>
    </>
  );
  const className = "inline-flex items-center gap-2";
  if (as === "div") return <div className={className}>{content}</div>;
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
