import { RegisterForm } from "@/components/auth/register-form";

import { registerAction } from "../actions";

export default function RegisterPage() {
  return <RegisterForm action={registerAction} />;
}
