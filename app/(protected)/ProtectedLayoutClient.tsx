"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Sidebar from "@/components/Sidebar";
import { C } from "@/lib/constants";
import type { Profile } from "@/lib/types";

export default function ProtectedLayoutClient({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: C.gray50, color: C.gray800 }}>

      {/* ── Header mobile (visible < 768px seulement) ── */}
      <header className="tx-mobile-header" style={{
        position: "sticky", top: 0, zIndex: 100,
        background: C.navy, padding: "0 16px",
        height: 56, alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)", flexShrink: 0,
      }}>
        <img src="/logo.png" alt="Taxi Romontois"
          style={{ height: 32, width: "auto", display: "block" }} />
        <button onClick={handleSignOut}
          style={{ padding: "8px 14px", borderRadius: 8, border: "none",
            background: "rgba(220,38,38,0.2)", color: "#FCA5A5",
            fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Déconnexion
        </button>
      </header>

      {/* ── Corps : sidebar + contenu ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar desktop */}
        <div className="tx-sidebar">
          <Sidebar
            role={profile.role}
            nom={profile.nom}
            prenom={profile.prenom}
            onSignOut={handleSignOut}
          />
        </div>

        {/* Contenu principal */}
        <div className="tx-main-padding" style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
