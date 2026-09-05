"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: ReactNode;
  labelAddon?: ReactNode;
  trailing?: ReactNode;
}

export function TextField({ label, icon, labelAddon, trailing, id, ...props }: TextFieldProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-neutral-400">
          {label}
        </label>
        {labelAddon}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
          {icon}
        </span>
        <input
          id={id}
          className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-10 pr-20 text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
          {...props}
        />
        {trailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
    </div>
  );
}
