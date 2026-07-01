"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LogOut, LayoutDashboard, FileText, Zap, Users, Bus, Map, Heart,
  AlertTriangle, Bell, Wrench, Download, MessageSquare,
  Settings, Smartphone, FolderDown, Home, School,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { C } from "@/lib/constants";
import type { Role } from "@/lib/types";

const NAV_ITEMS: Record<Role, { path: string; label: string; icon: LucideIcon }[]> = {
  gestionnaire: [
    { path: "/gestionnaire",               label: "Tableau de bord",    icon: LayoutDashboard },
    { path: "/gestionnaire/rapport",       label: "Rapport journalier", icon: FileText },
    { path: "/gestionnaire/imprevus",      label: "Imprévus",           icon: Zap },
    { path: "/gestionnaire/conducteurs",   label: "Conducteurs",        icon: Users },
    { path: "/gestionnaire/vehicules",     label: "Véhicules",          icon: Bus },
    { path: "/gestionnaire/circuits",        label: "Circuits",           icon: Map },
    { path: "/gestionnaire/etablissements", label: "Établissements",     icon: School },
    { path: "/gestionnaire/parents",        label: "Parents",            icon: Heart },
    { path: "/gestionnaire/incidents",     label: "Incidents",          icon: AlertTriangle },
    { path: "/gestionnaire/alertes",       label: "Alertes",            icon: Bell },
    { path: "/gestionnaire/reparations",   label: "Réparations",        icon: Wrench },
    { path: "/gestionnaire/export",        label: "Exports",            icon: Download },
    { path: "/gestionnaire/messages",      label: "Messages",           icon: MessageSquare },
  ],
  conducteur: [
    { path: "/conducteur", label: "Mon tableau de bord", icon: LayoutDashboard },
  ],
  admin: [
    { path: "/admin",            label: "Administration", icon: Settings },
    { path: "/admin/conducteurs",label: "Conducteurs",    icon: Users },
    { path: "/admin/vehicules",  label: "Véhicules",      icon: Bus },
    { path: "/admin/qrcodes",    label: "QR Codes",       icon: Smartphone },
    { path: "/admin/export",     label: "Exports",        icon: FolderDown },
  ],
  mecanicien: [
    { path: "/mecanicien", label: "Atelier & flotte", icon: Wrench },
  ],
  parent: [
    { path: "/parent", label: "Mon espace", icon: Home },
  ],
  ecole: [
    { path: "/ecole", label: "Mon établissement", icon: Home },
  ],
};

interface SidebarProps {
  role: Role;
  nom: string;
  prenom: string;
  onSignOut: () => void;
  incidentsCount?: number;
  alertesCount?: number;
  reparationsCount?: number;
  messagesCount?: number;
  congesCount?: number;
  onNavClick?: () => void;
}

export default function Sidebar({ role, nom, prenom, onSignOut, onNavClick, incidentsCount = 0, alertesCount = 0, reparationsCount = 0, messagesCount = 0, congesCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoError, setLogoError] = useState(false);
  const navItems = NAV_ITEMS[role] ?? NAV_ITEMS.gestionnaire;

  const ROLE_LABELS: Record<Role, string> = {
    gestionnaire: "Gestionnaire",
    conducteur:   "Conducteur",
    admin:        "Administrateur",
    mecanicien:   "Mécanicien",
    parent:       "Parent",
    ecole:        "Établissement",
  };

  const initials = ((prenom?.[0] ?? "") + (nom?.[0] ?? "")).toUpperCase() || "??";

  return (
    <div style={{ width: 228, background: C.navy, display: "flex", flexDirection: "column",
      flexShrink: 0, boxShadow: "2px 0 12px rgba(0,0,0,0.2)", height: "100%", overflow: "hidden" }}>

      {/* Logo + titre */}
      <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {logoError
          ? <div style={{ color: C.white, fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>Taxi Romontois</div>
          : <img src="/logo.png" alt="Taxi Romontois"
              style={{ width: 140, height: "auto", objectFit: "contain", display: "block" }}
              onError={() => setLogoError(true)} />
        }
        <div style={{ color: C.white, fontWeight: 800, fontSize: 14, marginTop: 10 }}>
          Taxi Romontois
        </div>
      </div>

      {/* Avatar */}
      <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.1)",
        display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.white,
          color: C.navy, display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 16, flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, color: C.white, fontWeight: 700,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {prenom} {nom}
          </div>
          <div style={{ fontSize: 12, color: C.sky, fontWeight: 600 }}>
            {ROLE_LABELS[role]}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px", overflowY: "auto" }}>
        {navItems.map(item => {
          const active = pathname === item.path || (pathname.startsWith(item.path + "/") && item.path !== "/" + role);
          const badge = item.path.includes("incidents") ? incidentsCount
            : item.path.includes("alertes") ? alertesCount
            : item.path.includes("reparations") ? reparationsCount
            : item.path.includes("messages") ? messagesCount
            : item.path.endsWith("/conducteurs") ? congesCount : 0;
          const Icon = item.icon;

          return (
            <button key={item.path} onClick={() => { router.push(item.path); onNavClick?.(); }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                background: active ? C.white : "transparent",
                color: active ? C.navy : C.white,
                fontWeight: active ? 800 : 600, fontSize: 13, textAlign: "left",
                marginBottom: 2, transition: "background .15s" }}>
              <Icon size={17} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {badge > 0 && (
                <span style={{ background: C.red, color: C.white, borderRadius: 20,
                  fontSize: 10, fontWeight: 800, padding: "1px 7px" }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <button onClick={onSignOut}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "none",
            background: "transparent", color: C.white,
            cursor: "pointer", fontSize: 14, fontWeight: 700, textAlign: "left",
            display: "flex", alignItems: "center", gap: 8, transition: "background .15s" }}>
          <LogOut size={16} color={C.white} />
          Déconnexion
        </button>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 8, paddingLeft: 4 }}>
          v2.0 · Taxi Romontois
        </div>
      </div>
    </div>
  );
}
