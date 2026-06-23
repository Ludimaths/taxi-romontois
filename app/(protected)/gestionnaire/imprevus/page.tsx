"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import type { Conducteur, Alerte } from "@/lib/types";

type ImprevuType = "absence" | "ecole" | "parent" | "vehicule" | "meteo" | "autre";

interface Recipient {
  id: string;
  label: string;
  type: "conducteur" | "mecanicien" | "admin" | "gestionnaire";
  driver_id?: number;
  subtitle?: string;
}

const TYPES: { id: ImprevuType; icon: string; label: string; color: string }[] = [
  { id: "absence",  icon: "🤒", label: "Absence",          color: C.red },
  { id: "ecole",    icon: "🏫", label: "École",             color: C.navyL },
  { id: "parent",   icon: "👨‍👩‍👧", label: "Parent",           color: C.amber },
  { id: "vehicule", icon: "🚌", label: "Véhicule",          color: C.navyL },
  { id: "meteo",    icon: "🌧️", label: "Météo",             color: C.sky },
  { id: "autre",    icon: "❓", label: "Autre",             color: C.gray600 },
];

const TEMPLATES: Record<ImprevuType, string> = {
  absence:  "Un conducteur est absent aujourd'hui. Des dispositions ont été prises pour assurer le transport de votre enfant.",
  ecole:    "Suite à une information de l'école, nous vous informons d'une modification du transport scolaire aujourd'hui.",
  parent:   "Bonjour, le conducteur habituel est absent aujourd'hui. Un remplaçant assurera le transport de votre enfant. Tout est géré, ne vous inquiétez pas.",
  vehicule: "En raison d'un problème technique sur un véhicule, le transport scolaire est temporairement modifié.",
  meteo:    "En raison des conditions météorologiques, le transport scolaire est adapté aujourd'hui. Nous veillons à la sécurité de tous les enfants.",
  autre:    "",
};

const SEVERITY_MAP: Record<ImprevuType, "haute" | "normale"> = {
  absence:  "haute",
  ecole:    "normale",
  parent:   "haute",
  vehicule: "haute",
  meteo:    "normale",
  autre:    "normale",
};

const fmtDT = (d: string) => new Date(d).toLocaleString("fr-CH", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  false:  { label: "En attente", color: C.amber,  bg: C.amberL },
  true:   { label: "Lu",         color: C.navyL,  bg: C.skyL },
};

export default function ImprevusPage() {
  const sb = createClient();

  const [drivers,    setDrivers]    = useState<Conducteur[]>([]);
  const [profiles,   setProfiles]   = useState<{ id: string; prenom: string; nom: string; role: string }[]>([]);
  const [sentAlerts, setSentAlerts] = useState<(Alerte & { recipient_label?: string })[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Form state
  const [type,        setType]        = useState<ImprevuType | "">("");
  const [message,     setMessage]     = useState("");
  const [useTemplate, setUseTemplate] = useState(false);
  const [category,    setCategory]    = useState<"conducteurs"|"mecanicien"|"admin"|"parents"|"">("");
  const [selected,    setSelected]    = useState<Recipient[]>([]);
  const [sending,     setSending]     = useState(false);
  const [sent,        setSent]        = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const fetchData = useCallback(async () => {
    const [drv, prof, alt] = await Promise.all([
      sb.from("conducteurs").select("*").order("nom"),
      sb.from("profiles").select("id,prenom,nom,role").in("role", ["mecanicien", "admin", "gestionnaire", "parent"]).order("nom"),
      sb.from("alertes")
        .select("*")
        .eq("type", "imprévu")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setDrivers(drv.data ?? []);
    setProfiles(prof.data ?? []);
    setSentAlerts(alt.data ?? []);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    fetchData();
    const ch = sb.channel("imprevus-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alertes" }, fetchData)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchData, sb]);

  // Apply template
  useEffect(() => {
    if (useTemplate && type) setMessage(TEMPLATES[type as ImprevuType] || "");
  }, [useTemplate, type]);

  // Recipients by category
  const CATEGORIES: { id: "conducteurs"|"mecanicien"|"admin"|"parents"; label: string; icon: string }[] = [
    { id: "conducteurs", label: "Conducteurs", icon: "👤" },
    { id: "mecanicien",  label: "Mécanicien",  icon: "🔧" },
    { id: "admin",       label: "Admin",        icon: "⚙️" },
    { id: "parents",     label: "Parents",      icon: "👪" },
  ];

  const recipientsForCategory = (cat: string): Recipient[] => {
    if (cat === "conducteurs") return drivers.map(d => ({
      id: `drv-${d.id}`, label: `${d.prenom} ${d.nom}`,
      type: "conducteur" as const, driver_id: d.id,
      subtitle: d.status === "en_service" ? "En service" : d.status === "absent" ? "Absent" : "Disponible",
    }));
    if (cat === "mecanicien") return profiles.filter(p => p.role === "mecanicien").map(p => ({
      id: `prof-${p.id}`, label: `${p.prenom} ${p.nom}`, type: "mecanicien" as const, subtitle: "Mécanicien",
    }));
    if (cat === "admin") return profiles.filter(p => p.role === "admin").map(p => ({
      id: `prof-${p.id}`, label: `${p.prenom} ${p.nom}`, type: "admin" as const, subtitle: "Administrateur",
    }));
    if (cat === "parents") return profiles.filter(p => p.role === "parent").map(p => ({
      id: `prof-${p.id}`, label: `${p.prenom} ${p.nom}`, type: "conducteur" as const, subtitle: "Parent",
    }));
    return [];
  };

  const categoryRecipients = category ? recipientsForCategory(category) : [];

  const isSelected = (r: Recipient) => selected.some(s => s.id === r.id);

  const toggleRecipient = (r: Recipient) => {
    setSelected(prev => isSelected(r) ? prev.filter(s => s.id !== r.id) : [...prev, r]);
  };

  const handleSend = async () => {
    if (!type || !message.trim() || selected.length === 0) return;
    setSending(true);
    const typeLabel = TYPES.find(t => t.id === type)?.label || type;
    const severity  = SEVERITY_MAP[type as ImprevuType] || "normale";

    await Promise.all(selected.map(recipient => {
      const payload: Record<string, unknown> = {
        type: "imprévu",
        severity,
        message: `[${typeLabel}] ${message.trim()}`,
        read: false,
        created_at: new Date().toISOString(),
      };
      if (recipient.type === "conducteur" && recipient.driver_id) {
        payload.driver_id = recipient.driver_id;
      }
      if (recipient.type === "mecanicien") {
        payload.type = "transmis_meca";
      }
      return sb.from("alertes").insert(payload);
    }));

    await fetchData();
    setType("");
    setMessage("");
    setSelected([]);
    setCategory("");
    setUseTemplate(false);
    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };

  const inputSt: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: `1px solid ${C.gray200}`, fontSize: 14, color: C.gray800,
    fontFamily: "inherit", boxSizing: "border-box", background: C.white,
  };

  const labelSt: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 700, color: C.gray600,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60, color: C.gray400 }}>
      <div>⏳ Chargement…</div>
    </div>
  );

  // Group sent alerts by batch (same message+type, same minute)
  type AlertGroup = { key: string; alerts: typeof sentAlerts; type: string; message: string; at: string };
  const allGroups: AlertGroup[] = [];
  const seen = new Set<string>();
  for (const a of sentAlerts) {
    const key = `${a.message?.slice(0, 60)}-${a.created_at?.slice(0, 16)}`;
    if (!seen.has(key)) {
      seen.add(key);
      const group = sentAlerts.filter(x =>
        x.message?.slice(0, 60) === a.message?.slice(0, 60) &&
        x.created_at?.slice(0, 16) === a.created_at?.slice(0, 16)
      );
      allGroups.push({ key, alerts: group, type: a.type, message: a.message || "", at: a.created_at || "" });
    }
  }
  const todayISO = new Date().toISOString().slice(0, 10);
  const todayGroups  = allGroups.filter(g => g.at.slice(0, 10) === todayISO);
  const olderGroups  = allGroups.filter(g => g.at.slice(0, 10) !== todayISO);
  const visibleGroups = showHistory ? allGroups : todayGroups;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, marginBottom: 4 }}>⚡ Imprévus</h1>
        <p style={{ fontSize: 13, color: C.gray600 }}>
          Envoie une notification ciblée aux conducteurs, parents, mécanicien ou admin.
        </p>
      </div>

      {/* Success banner */}
      {sent && (
        <div style={{ background: C.greenL, borderRadius: 12, padding: "12px 16px", marginBottom: 16,
          border: `1px solid #86EFAC`, fontWeight: 700, color: C.green, fontSize: 14 }}>
          ✅ Messages envoyés à {selected.length} destinataire(s).
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* ── Formulaire ────────────────────────────────────── */}
        <div style={{ background: C.white, borderRadius: 14, padding: 20,
          border: `1px solid ${C.gray200}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

          <div style={{ fontWeight: 800, fontSize: 15, color: C.navy, marginBottom: 16 }}>
            Nouveau message
          </div>

          {/* Type */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelSt}>Type d'imprévu *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TYPES.map(t => (
                <button key={t.id} onClick={() => { setType(t.id); setUseTemplate(false); }}
                  style={{ padding: "7px 12px", borderRadius: 20, border: `2px solid ${type === t.id ? t.color : C.gray200}`,
                    background: type === t.id ? t.color : C.white,
                    color: type === t.id ? C.white : C.gray600,
                    fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message + template */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ ...labelSt, marginBottom: 0 }}>Message *</label>
              {type && TEMPLATES[type as ImprevuType] && (
                <button onClick={() => setUseTemplate(v => { if (!v) setMessage(TEMPLATES[type as ImprevuType]); return !v; })}
                  style={{ fontSize: 11, color: C.navyL, background: "none", border: "none",
                    cursor: "pointer", fontWeight: 700 }}>
                  {useTemplate ? "✏️ Éditer librement" : "📋 Utiliser modèle"}
                </button>
              )}
            </div>
            <textarea value={message} onChange={e => { setMessage(e.target.value); setUseTemplate(false); }}
              rows={4} placeholder="Saisissez votre message…"
              style={{ ...inputSt, resize: "vertical" }} />
            {type === "parent" && (
              <div style={{ fontSize: 11, color: C.gray400, marginTop: 4, lineHeight: 1.5 }}>
                💡 Modèle parent : "Bonjour, le conducteur habituel est absent aujourd'hui. Un remplaçant assurera le transport de votre enfant. Tout est géré, ne vous inquiétez pas."
              </div>
            )}
          </div>

          {/* Destinataires — sélection par catégorie */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelSt}>Destinataires *</label>
            {/* Catégories */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setCategory(prev => prev === cat.id ? "" : cat.id)}
                  style={{ padding: "6px 12px", borderRadius: 20, fontWeight: 700, fontSize: 12,
                    cursor: "pointer", border: `2px solid ${category === cat.id ? C.navyL : C.gray200}`,
                    background: category === cat.id ? C.navyL : C.white,
                    color: category === cat.id ? C.white : C.gray600 }}>
                  {cat.icon} {cat.label}
                  {category === cat.id && ` (${categoryRecipients.length})`}
                </button>
              ))}
            </div>
            {/* Liste de la catégorie */}
            {category && (
              <div style={{ border: `1px solid ${C.gray200}`, borderRadius: 10,
                maxHeight: 200, overflowY: "auto", background: C.white }}>
                {categoryRecipients.length === 0 ? (
                  <div style={{ padding: "12px 14px", fontSize: 12, color: C.gray400 }}>
                    Aucun {CATEGORIES.find(c => c.id === category)?.label.toLowerCase()} trouvé
                  </div>
                ) : categoryRecipients.map(r => {
                  const isSel = isSelected(r);
                  return (
                    <div key={r.id} onClick={() => toggleRecipient(r)}
                      style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px",
                        cursor: "pointer", borderBottom: `1px solid ${C.gray100}`,
                        background: isSel ? C.skyL : C.white }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.gray800 }}>{r.label}</div>
                        <div style={{ fontSize: 11, color: C.gray400 }}>{r.subtitle}</div>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13,
                        color: isSel ? C.green : C.gray200 }}>
                        {isSel ? "✓" : "+"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Destinataires sélectionnés */}
          {selected.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelSt}>Sélection ({selected.length})</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selected.map(r => (
                  <div key={r.id} onClick={() => toggleRecipient(r)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
                      borderRadius: 20, background: C.skyL, border: `1px solid ${C.navyL}`,
                      fontSize: 12, fontWeight: 700, color: C.navyL, cursor: "pointer" }}>
                    {r.label}
                    <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Envoyer */}
          <button onClick={handleSend}
            disabled={!type || !message.trim() || selected.length === 0 || sending}
            style={{ width: "100%", padding: "13px", borderRadius: 10, fontWeight: 800, fontSize: 15,
              border: "none", cursor: (!type || !message.trim() || selected.length === 0) ? "not-allowed" : "pointer",
              background: (!type || !message.trim() || selected.length === 0) ? C.gray200 : C.navyL,
              color: (!type || !message.trim() || selected.length === 0) ? C.gray400 : C.white,
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
            {sending ? "Envoi en cours…" : `📤 Envoyer à ${selected.length} destinataire(s)`}
          </button>
        </div>

        {/* ── Historique des envois ─────────────────────────── */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: C.navy }}>
              Imprévus du jour
              {todayGroups.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: C.gray400 }}>
                  ({todayGroups.length} envoi{todayGroups.length > 1 ? "s" : ""})
                </span>
              )}
            </div>
            {olderGroups.length > 0 && (
              <button onClick={() => setShowHistory(v => !v)}
                style={{ fontSize: 12, fontWeight: 700, color: C.navyL, background: "none",
                  border: `1px solid ${C.navyL}`, borderRadius: 20, padding: "4px 12px", cursor: "pointer" }}>
                {showHistory ? "Masquer l'historique" : `Voir l'historique (${olderGroups.length})`}
              </button>
            )}
          </div>
          {visibleGroups.length === 0 ? (
            <div style={{ background: C.white, borderRadius: 14, padding: 24,
              border: `1px solid ${C.gray200}`, textAlign: "center", color: C.gray400 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 13 }}>Aucun imprévu envoyé aujourd'hui</div>
            </div>
          ) : (() => {
            // Group by day for separators
            const byDay: Record<string, AlertGroup[]> = {};
            visibleGroups.forEach(g => {
              const day = g.at.slice(0, 10);
              if (!byDay[day]) byDay[day] = [];
              byDay[day].push(g);
            });
            return Object.entries(byDay).sort(([a],[b]) => b.localeCompare(a)).map(([day, groups]) => {
              const dayLabel = new Date(day + "T12:00:00").toLocaleDateString("fr-FR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              });
              return (
                <div key={day}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.gray400, textTransform: "uppercase",
                    letterSpacing: 0.5, padding: "10px 0 6px",
                    borderBottom: `1px solid ${C.gray100}`, marginBottom: 10 }}>
                    {day === todayISO ? `Aujourd'hui — ${dayLabel}` : dayLabel}
                  </div>
                  {groups.map(g => {
            const typeInfo = TYPES.find(t => t.id === g.type) || TYPES.find(t => t.id === "autre")!;
            const luCount  = g.alerts.filter(a => a.read).length;
            const totalCount = g.alerts.length;

            return (
              <div key={g.key} style={{ background: C.white, borderRadius: 14, padding: 16,
                marginBottom: 10, border: `1px solid ${C.gray200}`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{typeInfo.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: typeInfo.color, marginBottom: 2 }}>
                      {typeInfo.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, color: C.gray800, lineHeight: 1.4 }}>
                      {g.message.replace(/^\[.*?\]\s*/, "").slice(0, 120)}
                      {g.message.replace(/^\[.*?\]\s*/, "").length > 120 ? "…" : ""}
                    </div>
                    <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
                      {fmtDT(g.at)} · {totalCount} destinataire(s)
                    </div>
                  </div>
                </div>

                {/* Suivi par destinataire */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {g.alerts.map(a => {
                    const st = STATUS_MAP[String(a.read)];
                    return (
                      <div key={a.id} style={{ padding: "3px 9px", borderRadius: 20,
                        background: st.bg, color: st.color, fontSize: 11, fontWeight: 700 }}>
                        {a.driver_id ? `Conducteur #${a.driver_id}` : a.vehicle_id ? `Véhicule #${a.vehicle_id}` : "Staff"} — {st.label}
                      </div>
                    );
                  })}
                </div>

                {/* Résumé lu/total */}
                <div style={{ marginTop: 8, fontSize: 12, color: C.gray600 }}>
                  {luCount}/{totalCount} lu(s)
                  {luCount === totalCount && totalCount > 0 && (
                    <span style={{ marginLeft: 6, color: C.green, fontWeight: 700 }}>✅ Tous ont lu</span>
                  )}
                </div>
              </div>
            );
          })}
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}
