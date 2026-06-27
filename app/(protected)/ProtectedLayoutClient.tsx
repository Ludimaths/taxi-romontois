"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu } from "lucide-react";
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
  const router   = useRouter();
  const pathname = usePathname();
  const sb = createClient();
  const [incidentsCount,  setIncidentsCount]  = useState(0);
  const [alertesCount,    setAlertesCount]    = useState(0);
  const [reparationsCount,setReparationsCount]= useState(0);
  const [messagesCount,   setMessagesCount]   = useState(0);
  const [congesCount,     setCongesCount]     = useState(0);
  const [mobileNavOpen,   setMobileNavOpen]   = useState(false);

  const fetchCounts = useCallback(async () => {
    const [{ count: ic }, { count: ac }, { count: rc }, { count: mc }, { count: cc }] = await Promise.all([
      sb.from("incidents").select("id", { count: "exact", head: true }).neq("status", "resolu"),
      sb.from("alertes").select("id", { count: "exact", head: true }).eq("read", false),
      sb.from("reparations").select("id", { count: "exact", head: true }).eq("statut", "en_attente_validation"),
      sb.from("messages_internes").select("id", { count: "exact", head: true })
        .eq("lu", false).neq("expediteur_id", profile.id)
        .or(`destinataire_id.eq.${profile.id},destinataire_role.eq.${profile.role}`),
      sb.from("conges_demandes").select("id", { count: "exact", head: true }).eq("statut", "en_attente"),
    ]);
    setIncidentsCount(ic ?? 0);
    setAlertesCount(ac ?? 0);
    setReparationsCount(rc ?? 0);
    setMessagesCount(mc ?? 0);
    setCongesCount(cc ?? 0);
  }, [sb, profile.id, profile.role]);

  useEffect(() => {
    if (!["gestionnaire", "admin"].includes(profile.role)) return;
    fetchCounts();
    const ch = sb.channel("layout-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, fetchCounts)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alertes" },
        (payload) => {
          const n = payload.new as { read?: boolean };
          const o = payload.old as { read?: boolean };
          if (o?.read === false && n?.read === true) setAlertesCount(prev => Math.max(0, prev - 1));
          else fetchCounts();
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alertes" }, fetchCounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "reparations" }, fetchCounts)
      .on("postgres_changes", { event: "*", schema: "public", table: "conges_demandes" }, fetchCounts)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages_internes" },
        (payload) => {
          const n = payload.new as { lu?: boolean };
          const o = payload.old as { lu?: boolean };
          if (o?.lu === false && n?.lu === true) setMessagesCount(prev => Math.max(0, prev - 1));
          else fetchCounts();
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages_internes" }, fetchCounts)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchCounts, sb, profile.role]);

  const handleSignOut = async () => {
    await sb.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // Admin sur /admin/* : sa propre page gère le layout complet
  // Sur /gestionnaire/*, /mecanicien/* etc. → fall through pour afficher la sidebar gestionnaire
  if (profile.role === "admin" && (!pathname || pathname.startsWith("/admin"))) {
    return (
      <div style={{ minHeight: "100vh", background: C.gray50, color: C.gray800 }}>
        <div>{children}</div>
      </div>
    );
  }

  // Conducteur : la page gère son propre header et drawer mobile
  if (profile.role === "conducteur") {
    return (
      <div style={{ minHeight: "100vh", background: C.gray50, color: C.gray800 }}>
        {children}
      </div>
    );
  }

  // Mécanicien : la page gère son propre header et drawer mobile
  if (profile.role === "mecanicien") {
    return (
      <div style={{ minHeight: "100vh", background: C.gray50, color: C.gray800 }}>
        {children}
      </div>
    );
  }

  // Admin visitant /gestionnaire/* ou /mecanicien/* → sidebar gestionnaire
  const navRole = (profile.role === "admin" ? "gestionnaire" : profile.role) as import("@/lib/types").Role;

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
        <button onClick={() => setMobileNavOpen(true)}
          style={{ position: "relative", background: "transparent", border: "none",
            color: C.white, cursor: "pointer", padding: 8, borderRadius: 8,
            display: "flex", alignItems: "center" }}>
          <Menu size={24} color={C.white} />
          {(incidentsCount + alertesCount + reparationsCount + messagesCount + congesCount) > 0 && (
            <span style={{ position: "absolute", top: 4, right: 4, background: C.red,
              color: C.white, borderRadius: 99, fontSize: 9, fontWeight: 900,
              minWidth: 14, height: 14, display: "flex", alignItems: "center",
              justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
              {Math.min(incidentsCount + alertesCount + reparationsCount + messagesCount + congesCount, 99)}
            </span>
          )}
        </button>
      </header>

      {/* ── Drawer mobile ── */}
      {mobileNavOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileNavOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
          <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 228, zIndex: 1000, boxShadow: "-4px 0 20px rgba(0,0,0,0.3)" }}>
            <Sidebar
              role={navRole}
              nom={profile.nom}
              prenom={profile.prenom}
              onSignOut={handleSignOut}
              onNavClick={() => setMobileNavOpen(false)}
              incidentsCount={incidentsCount}
              alertesCount={alertesCount}
              reparationsCount={reparationsCount}
              messagesCount={messagesCount}
              congesCount={congesCount}
            />
          </div>
        </div>
      )}

      {/* ── Corps : sidebar + contenu ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar desktop */}
        <div className="tx-sidebar">
          <Sidebar
            role={navRole}
            nom={profile.nom}
            prenom={profile.prenom}
            onSignOut={handleSignOut}
            incidentsCount={incidentsCount}
            alertesCount={alertesCount}
            reparationsCount={reparationsCount}
            messagesCount={messagesCount}
            congesCount={congesCount}
          />
        </div>

        {/* Contenu principal */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Bannière mode consultation (admin visitant /gestionnaire ou /mecanicien) */}
          {profile.role === "admin" && (
            <div style={{ background: "#FEF3C7", borderBottom: "2px solid #D97706",
              padding: "10px 20px", display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8,
                fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                <span style={{ fontSize: 16 }}>👁</span>
                <span>Mode consultation administrateur</span>
              </div>
              <button onClick={() => router.push("/admin")}
                style={{ padding: "6px 16px", borderRadius: 8, border: "none",
                  background: C.navy, color: C.white, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", whiteSpace: "nowrap" }}>
                ← Retour Admin
              </button>
            </div>
          )}
          <div className="tx-main-padding" style={{ flex: 1 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
