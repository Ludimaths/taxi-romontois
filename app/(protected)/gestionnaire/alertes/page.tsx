"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Btn } from "@/components/ui";
import type { Alerte } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDTLong = (d: string) => {
  const dt = new Date(d);
  const date = dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const h = String(dt.getHours()).padStart(2, "0");
  const m = String(dt.getMinutes()).padStart(2, "0");
  return `${date} à ${h}h${m}`;
};
const fmtDT = (d: string) => {
  const dt = new Date(d);
  const h = String(dt.getHours()).padStart(2, "0");
  const m = String(dt.getMinutes()).padStart(2, "0");
  return `${dt.toLocaleDateString("fr-CH")} à ${h}h${m}`;
};

// ── Type config ───────────────────────────────────────────────────────────────
const TYPE_CFG: Record<string, { label: string; icon: string; color: string }> = {
  conducteur:         { label: "Conducteur",          icon: "👤", color: C.navyL  },
  vehicule:           { label: "Véhicule",             icon: "🚌", color: C.navy   },
  reparation:         { label: "Réparation",           icon: "🔧", color: C.amber  },
  validation_requise: { label: "Validation budget",    icon: "💰", color: C.red    },
  remise_circulation: { label: "Remise en service",    icon: "✅", color: C.green  },
  transmis_meca:      { label: "Mécanicien",           icon: "🔩", color: C.purple },
  rapport_admin:      { label: "Rapport admin",        icon: "📋", color: C.navy   },
  remplacement:       { label: "Remplacement",         icon: "🔄", color: C.amber  },
  "imprévu":          { label: "Imprévu",              icon: "⚡", color: C.sky    },
  document:           { label: "Document expiré",      icon: "📄", color: C.red    },
};
const cfgOf = (type: string) => TYPE_CFG[type] ?? { label: type, icon: "🔔", color: C.gray600 };

const SEV_CFG = {
  critique: { label: "Critique", color: C.red,   bg: C.redL   },
  haute:    { label: "Haute",    color: C.amber, bg: C.amberL },
  normale:  { label: "Normale",  color: C.gray600, bg: C.gray100 },
};

const ALL_TYPES = Object.entries(TYPE_CFG).map(([id, v]) => ({ id, label: v.label }));

const inp: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.gray200}`,
  fontSize: 13, color: C.gray800, background: C.white,
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AlertesPage() {
  const sb = createClient();
  const [alertes,  setAlertes]  = useState<Alerte[]>([]);
  const [drivers,  setDrivers]  = useState<{ id: number; prenom: string; nom: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; plaque: string }[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selId,    setSelId]    = useState<number | null>(null);

  // Filters
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("unread"); // unread | all | read
  const [filterVeh,  setFilterVeh]  = useState("");
  const [filterDrv,  setFilterDrv]  = useState("");

  const fetchAll = useCallback(async () => {
    const [alt, drv, veh] = await Promise.all([
      sb.from("alertes").select("*").order("created_at", { ascending: false }),
      sb.from("conducteurs").select("id,prenom,nom").order("nom"),
      sb.from("vehicules").select("id,plaque").order("plaque"),
    ]);
    setAlertes(alt.data ?? []);
    setDrivers(drv.data ?? []);
    setVehicles(veh.data ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    fetchAll();
    const ch = sb.channel("gest-alertes-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, fetchAll)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchAll, sb]);

  const markRead = async (id: number) => {
    await sb.from("alertes").update({ read: true, read_at: new Date().toISOString() }).eq("id", id);
    fetchAll();
    if (selId === id) setSelId(null);
  };

  const markAllRead = async () => {
    await sb.from("alertes").update({ read: true, read_at: new Date().toISOString() }).eq("read", false);
    fetchAll();
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = alertes.filter(a => {
    if (filterStatus === "unread" && a.read) return false;
    if (filterStatus === "read"   && !a.read) return false;
    if (filterType !== "all" && a.type !== filterType) return false;
    if (filterVeh && a.vehicle_id !== filterVeh) return false;
    if (filterDrv && String(a.driver_id) !== filterDrv) return false;
    return true;
  });

  // ── Sort: non lues > haute > critique > date ───────────────────────────────
  const sevOrder = { critique: 0, haute: 1, normale: 2 };
  const sorted = [...filtered].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    const as = sevOrder[a.severity] ?? 2;
    const bs = sevOrder[b.severity] ?? 2;
    if (as !== bs) return as - bs;
    return b.created_at.localeCompare(a.created_at);
  });

  const unreadCnt = alertes.filter(a => !a.read).length;
  const sel = selId ? alertes.find(a => a.id === selId) ?? null : null;

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: C.gray400, fontSize: 14 }}>Chargement…</div>
  );

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, margin: "0 0 4px" }}>
            Alertes {unreadCnt > 0 && (
              <span style={{ fontSize: 16, background: C.red, color: C.white, borderRadius: 20,
                padding: "2px 10px", verticalAlign: "middle", marginLeft: 8 }}>{unreadCnt}</span>
            )}
          </h1>
          <p style={{ fontSize: 13, color: C.gray600, margin: 0 }}>
            {alertes.length} au total · mise à jour automatique
          </p>
        </div>
        {unreadCnt > 0 && (
          <Btn small onClick={markAllRead} color={C.green}>✓ Tout marquer lu</Btn>
        )}
      </div>

      {/* Filters */}
      <div style={{ background: C.white, borderRadius: 14, padding: "12px 16px", marginBottom: 20,
        border: `1px solid ${C.gray200}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>

        {/* Status */}
        <div style={{ display: "flex", gap: 6 }}>
          {([["unread","Non lues"],["all","Toutes"],["read","Lues"]] as const).map(([v,l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filterStatus === v ? C.navyL : C.gray200}`,
                background: filterStatus === v ? C.navyL : C.white,
                color: filterStatus === v ? C.white : C.gray600,
                fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ height: 24, width: 1, background: C.gray200 }} />

        {/* Type */}
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inp}>
          <option value="all">Tous types</option>
          {ALL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        {/* Vehicle */}
        <select value={filterVeh} onChange={e => setFilterVeh(e.target.value)} style={inp}>
          <option value="">Tous véhicules</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.plaque}</option>)}
        </select>

        {/* Driver */}
        <select value={filterDrv} onChange={e => setFilterDrv(e.target.value)} style={inp}>
          <option value="">Tous conducteurs</option>
          {drivers.map(d => <option key={d.id} value={String(d.id)}>{d.prenom} {d.nom}</option>)}
        </select>

        {(filterType !== "all" || filterStatus !== "unread" || filterVeh || filterDrv) && (
          <button onClick={() => { setFilterType("all"); setFilterStatus("unread"); setFilterVeh(""); setFilterDrv(""); }}
            style={{ fontSize: 12, color: C.red, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
            × Réinitialiser
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔔</div>
          <p style={{ fontWeight: 700, fontSize: 16, color: C.gray600, margin: 0 }}>
            {filterStatus === "unread" ? "Aucune alerte non lue" : "Aucune alerte"}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: sel ? "1fr 1fr" : "1fr", gap: 20, alignItems: "start" }}>

          {/* List */}
          <div>
            {/* Group by read status */}
            {[false, true].map(isRead => {
              const group = sorted.filter(a => a.read === isRead);
              if (!group.length) return null;
              return (
                <div key={String(isRead)} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: isRead ? C.gray400 : C.navy,
                    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                    {isRead ? "✓ Lues" : `🔴 Non lues (${group.length})`}
                  </div>
                  {group.map(a => {
                    const cfg = cfgOf(a.type);
                    const sev = SEV_CFG[a.severity] ?? SEV_CFG.normale;
                    const veh = vehicles.find(v => v.id === a.vehicle_id);
                    const drv = drivers.find(d => d.id === a.driver_id);
                    return (
                      <div key={a.id} onClick={() => setSelId(a.id === selId ? null : a.id)}
                        style={{ background: a.read ? C.white : a.severity === "critique" ? "#FFF5F5" : a.severity === "haute" ? "#FFFBF0" : C.skyL,
                          borderRadius: 14, padding: "12px 16px", marginBottom: 10,
                          cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                          borderLeft: `4px solid ${sev.color}`,
                          border: selId === a.id ? `2px solid ${C.navyL}` : undefined,
                          opacity: a.read ? 0.8 : 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: "uppercase" }}>
                                {cfg.label}
                              </span>
                              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20,
                                background: sev.bg, color: sev.color, fontWeight: 700 }}>
                                {sev.label}
                              </span>
                            </div>
                            <div style={{ fontSize: 13, color: C.gray800, fontWeight: a.read ? 400 : 700,
                              lineHeight: 1.5, marginBottom: 4 }}>{a.message}</div>
                            <div style={{ fontSize: 11, color: C.gray400 }}>
                              {fmtDTLong(a.created_at)}
                              {veh && ` · ${veh.plaque}`}
                              {drv && ` · ${drv.prenom} ${drv.nom}`}
                            </div>
                          </div>
                          {!a.read && (
                            <button onClick={e => { e.stopPropagation(); markRead(a.id); }}
                              style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 8,
                                border: `1px solid ${C.green}`, background: C.white,
                                color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              Lu ✓
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          {sel && (()=>{
            const cfg = cfgOf(sel.type);
            const sev = SEV_CFG[sel.severity] ?? SEV_CFG.normale;
            const veh = vehicles.find(v => v.id === sel.vehicle_id);
            const drv = drivers.find(d => d.id === sel.driver_id);
            return (
              <div style={{ background: C.white, borderRadius: 16, padding: 20,
                border: `1px solid ${C.gray200}`, position: "sticky", top: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: C.navy }}>Détail</span>
                  <button onClick={() => setSelId(null)}
                    style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer", color: C.gray400,
                      lineHeight: 1, padding: "0 4px" }}>×</button>
                </div>
                <div style={{ background: sev.bg, borderRadius: 12, padding: "12px 14px",
                  borderLeft: `4px solid ${sev.color}`, marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                    <span style={{ fontWeight: 800, fontSize: 13, color: cfg.color }}>{cfg.label}</span>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11,
                      background: sev.bg, color: sev.color, fontWeight: 700,
                      border: `1px solid ${sev.color}30` }}>{sev.label}</span>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.gray800, lineHeight: 1.6, margin: 0 }}>
                    {sel.message}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                  {[
                    ["Date", fmtDTLong(sel.created_at)],
                    ...(veh ? [["Véhicule", veh.plaque]] : []),
                    ...(drv ? [["Conducteur", `${drv.prenom} ${drv.nom}`]] : []),
                    ...(sel.read_at ? [["Lu le", fmtDT(sel.read_at)]] : []),
                  ].map(([l,v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between",
                      borderBottom: `1px solid ${C.gray100}`, paddingBottom: 8, fontSize: 13 }}>
                      <span style={{ color: C.gray600, fontWeight: 600 }}>{l}</span>
                      <span style={{ color: C.gray800, fontWeight: 700, textAlign: "right" }}>{v}</span>
                    </div>
                  ))}
                </div>
                {!sel.read && (
                  <Btn full onClick={() => markRead(sel.id)} color={C.green}>✓ Marquer comme lu</Btn>
                )}
                {sel.read && (
                  <div style={{ textAlign: "center", padding: "8px 0", color: C.green, fontWeight: 700, fontSize: 13 }}>
                    ✓ Lu le {sel.read_at ? fmtDT(sel.read_at) : ""}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
