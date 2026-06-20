import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taxi Romontois — Transport scolaire",
  description: "Plateforme de gestion du transport scolaire",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "'Inter',-apple-system,sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
