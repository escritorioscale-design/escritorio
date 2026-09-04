import type { Metadata } from "next";
import "./globals.css";
import "./avatar-world.css";
import "@livekit/components-styles";

export const metadata: Metadata = {
  title: { default: "Orbit", template: "%s · Orbit" },
  description: "Escritório virtual para equipes distribuídas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
