"use client";
import { useState, useEffect, useCallback } from "react";
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
  const sb = createClient();
  const [incidentsCount,  setIncidentsCount]  = useState(0);
  const [alertesCount,    setAlertesCount]    = useState(0);
  const [reparationsCount,setReparationsCount]= useState(0);

  const fetchCounts = useCallback(async () => {
    const [{ count: ic }, { count: ac }, { count: rc }] = await Promise.all([
      sb.from("incidents").select("id", { count: "exact", head: true }).neq("status", "resolu"),
      sb.from("alertes").select("id", { count: "exact", head: true }).eq("read", false),
      sb.from("reparations").select("id", { count: "exact", head: true }).eq("statut", "en_attente_validation"),
    ]);
    setIncidentsCount(ic ?? 0);
    setAlertesCount(ac ?? 0);
    setReparationsCount(rc ?? 0);
  }, [sb]);

  useEffect(() => {
    if (!["gestionnaire", "admin"].includes(profile.role)) return;
    fetchCounts();
    const ch = sb.channel("layout-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, fetchCounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, fetchCounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "reparations" }, fetchCounts)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchCounts, sb, profile.role]);

  const handleSignOut = async () => {
    await sb.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // Conducteur : layout sans sidebar, header toujours visible
  if (profile.role === "conducteur") {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: C.gray50, color: C.gray800 }}>
        <header style={{
          position: "sticky", top: 0, zIndex: 100,
          background: C.navy, padding: "0 16px",
          height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)", flexShrink: 0,
        }}>
          <img src="/logo.png" alt="Taxi Romontois"
            style={{ height: 32, width: "auto", display: "block" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700, fontSize: 14 }}>
              {profile.prenom} {profile.nom}
            </span>
            <button onClick={handleSignOut}
              style={{ padding: "7px 13px", borderRadius: 8, border: "none",
                background: "rgba(220,38,38,0.2)", color: "#FCA5A5",
                fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Déconnexion
            </button>
          </div>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {children}
        </div>
      </div>
    );
  }

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
            incidentsCount={incidentsCount}
            alertesCount={alertesCount}
            reparationsCount={reparationsCount}
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
