"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Select({ value, onChange, options, placeholder = "Selecciona…", disabled, ariaLabel, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
      >
        <span className={current ? "truncate" : "truncate text-neutral-400"}>{current ? current.label : placeholder}</span>
        <ChevronRightIcon className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {open && (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-60 w-full min-w-max overflow-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                  selected ? "bg-accent/10 font-medium text-accent-700" : "hover:bg-neutral-50"
                }`}
              >
                {o.label}
                {selected && <CheckIcon className="h-4 w-4 shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
