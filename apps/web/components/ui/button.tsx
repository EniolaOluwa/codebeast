import type { ButtonHTMLAttributes } from "react";

import { cn } from "./cn";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "destructive" | "link";

export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary:
    "border border-border-strong bg-background text-foreground hover:bg-surface-hover",
  ghost: "text-foreground-muted hover:bg-surface-hover hover:text-foreground",
  destructive: "bg-danger text-white hover:opacity-90",
  link: "text-accent underline-offset-4 hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-sm",
  lg: "h-10 px-4 text-sm",
};

/** Shared class builder so `<Link>` can render as a button. */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition-colors duration-[120ms] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "submit",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      {...props}
    />
  );
}
