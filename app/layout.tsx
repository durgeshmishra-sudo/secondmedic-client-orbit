import type { Metadata } from "next";
import "./globals.css";
import "./restored-components.css";
import "./workspace-polish.css";

export const metadata: Metadata = {
  title: "SecondMedic CRM",
  description: "Client, pipeline, visit, invoice and payment tracking for your team.",
  icons: {
    icon: "/favicon.png?v=3",
    shortcut: "/favicon.png?v=3",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
