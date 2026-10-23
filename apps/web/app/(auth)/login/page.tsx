import { LoginForm } from "@/components/auth/login-form";

import { loginAction } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const expired = params.expired === "1";

  return <LoginForm action={loginAction} next={next} expired={expired} />;
}
