import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { MobileNav, Sidebar } from "@/components/shell/sidebar";
import { ApiError, apiFetch } from "@/lib/api";
import type { Me } from "@/lib/api-types";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  let me: Me;

  try {
    me = await apiFetch<Me>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/login?expired=1");
    }

    throw error;
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar userLabel={me.user.name ?? me.user.email} role={me.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
