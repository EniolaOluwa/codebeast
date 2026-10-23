import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import { cn } from "./cn";

const FIELD_CLASSES =
  "h-9 w-full rounded-md border border-border-strong bg-background px-3 text-sm text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-2 focus:outline-accent/30 disabled:opacity-50";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-danger-fg">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-foreground-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_CLASSES, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD_CLASSES, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}
