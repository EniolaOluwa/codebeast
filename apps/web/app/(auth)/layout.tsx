import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-16">
      <Link href="/" className="text-lg font-semibold tracking-[-0.02em]">
        CodeBeast
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6">
        {children}
      </div>
    </main>
  );
}
