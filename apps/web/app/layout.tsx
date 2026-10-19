import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CodeBeast",
  description:
    "Autonomous SRE platform that turns customer support tickets and Sentry errors into validated pull requests.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
