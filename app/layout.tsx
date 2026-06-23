import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Taxi Romontois — Transport scolaire",
  description: "Plateforme de gestion du transport scolaire",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={cn("font-sans", geist.variable)}>
      <body style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
