"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { C } from "@/lib/constants";
import type { Role } from "@/lib/types";

const NAV_ITEMS: Record<Role, { path: string; label: string; icon: string }[]> = {
  gestionnaire: [
    { path: "/gestionnaire",            label: "Tableau de bord", icon: "📊" },
    { path: "/gestionnaire/rapport",    label: "Rapport du jour", icon: "📋" },
    { path: "/gestionnaire/conducteurs",label: "Conducteurs",     icon: "👤" },
    { path: "/gestionnaire/vehicules",  label: "Véhicules",       icon: "🚌" },
    { path: "/gestionnaire/circuits",   label: "Circuits",        icon: "🗺" },
    { path: "/gestionnaire/incidents",  label: "Incidents",       icon: "⚡" },
    { path: "/gestionnaire/alertes",    label: "Alertes",         icon: "🔔" },
    { path: "/gestionnaire/export",     label: "Exports",         icon: "📁" },
  ],
  conducteur: [
    { path: "/conducteur",          label: "Mon tableau de bord", icon: "📊" },
    { path: "/conducteur/vehicules",label: "Scanner QR",          icon: "📱" },
  ],
  admin: [
    { path: "/admin",            label: "Administration", icon: "⚙️" },
    { path: "/admin/conducteurs",label: "Conducteurs",   icon: "👤" },
    { path: "/admin/vehicules",  label: "Véhicules",     icon: "🚌" },
    { path: "/admin/qrcodes",    label: "QR Codes",      icon: "📲" },
    { path: "/admin/export",     label: "Exports",       icon: "📁" },
  ],
  mecanicien: [
    { path: "/mecanicien", label: "Atelier & flotte", icon: "🔧" },
  ],
  parent: [
    { path: "/parent", label: "Mon espace", icon: "🏠" },
  ],
};

interface SidebarProps {
  role: Role;
  nom: string;
  prenom: string;
  onSignOut: () => void;
  incidentsCount?: number;
  alertesCount?: number;
}

export default function Sidebar({ role, nom, prenom, onSignOut, incidentsCount = 0, alertesCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoError, setLogoError] = useState(false);
  const navItems = NAV_ITEMS[role] ?? NAV_ITEMS.gestionnaire;

  const ROLE_LABELS: Record<Role, string> = {
    gestionnaire: "👔 Gestionnaire",
    conducteur:   "🚌 Conducteur",
    admin:        "⚙️ Administrateur",
    mecanicien:   "🔧 Mécanicien",
    parent:       "👪 Parent",
  };

  return (
    <div style={{ width: 228, background: C.navy, display: "flex", flexDirection: "column",
      flexShrink: 0, boxShadow: "2px 0 12px rgba(0,0,0,0.2)", height: "100vh" }}>

      {/* Logo */}
      <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ marginBottom: 14 }}>
          {logoError
            ? <span style={{ color: C.white, fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>Taxi Romontois</span>
            : <img src="/logo.png" alt="Taxi Romontois"
                style={{ width: 160, maxWidth: "100%", height: "auto", display: "block" }}
                onError={() => setLogoError(true)} />
          }
        </div>
        <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {ROLE_LABELS[role]}
          </div>
          <div style={{ fontSize: 13, color: C.white, fontWeight: 700, marginTop: 2 }}>
            {prenom} {nom}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px" }}>
        {navItems.map(item => {
          const active = pathname === item.path || (pathname.startsWith(item.path + "/") && item.path !== "/" + role);
          const badge = item.path.includes("incidents") ? incidentsCount
            : item.path.includes("alertes") ? alertesCount : 0;

          return (
            <button key={item.path} onClick={() => router.push(item.path)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                background: active ? "rgba(66,165,245,0.2)" : "transparent",
                color: active ? C.sky : "rgba(255,255,255,0.65)",
                fontWeight: active ? 700 : 400, fontSize: 13, textAlign: "left",
                marginBottom: 2, transition: "all .15s" }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {badge > 0 && (
                <span style={{ background: item.path.includes("incidents") ? C.red : C.navyL,
                  color: C.white, borderRadius: 20, fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <button onClick={onSignOut}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "none",
            background: "rgba(220,38,38,0.15)", color: "#FCA5A5",
            cursor: "pointer", fontSize: 12, fontWeight: 700, textAlign: "left" }}>
          🚪 Déconnexion
        </button>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>
          v2.0 · Taxi Romontois
        </div>
      </div>
    </div>
  );
}
