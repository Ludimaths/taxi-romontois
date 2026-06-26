"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, statusLabel, todayStr, fmtDate, fmtDateTime, fmtEnfant } from "@/lib/constants";
import { Badge, Card, Avatar } from "@/components/ui";
import type { Conducteur, Circuit, Incident, Alerte, AbsenceEnfant, Reparation } from "@/lib/types";
import { AlertTriangle, MapPin, AlertCircle, Bell, Wrench, Baby, UserX, RefreshCw } from "lucide-react";

type Periode = "jour" | "semaine" | "mois";

interface AbsenceConducteur {
  id: number;
  conducteur_id: number;
  remplacant_id: number | null;
  circuit_id: string | null;
  date_absence: string;
  motif: string | null;
  status: string;
  created_at: string;
  conducteur?: { prenom: string; nom: string };
  remplacant?: { prenom: string; nom: string };
  circuit?: { emoji: string; nom: string; num: string };
}

const sevColor = (s: string) => ({ normale: "gray", haute: "amber", critique: "red" }[s] ?? "gray") as any;
const sevLabel = (s: string) => ({ normale: "Normale", haute: "Haute", critique: "Critique" }[s] ?? s);

export default function RapportPage() {
  const supabase = createClient();
  const [periode, setPeriode] = useState<Periode>("jour");
  const [drivers, setDrivers] = useState<Conducteur[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [absences, setAbsences] = useState<AbsenceEnfant[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [remplacements, setRemplacements] = useState<AbsenceConducteur[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const now = new Date();
      let since: string;
      if (periode === "jour") {
        const d = new Date(now); d.setHours(0,0,0,0); since = d.toISOString();
      } else if (periode === "semaine") {
        const d = new Date(now); d.setDate(d.getDate() - 7); since = d.toISOString();
      } else {
        const d = new Date(now); d.setMonth(d.getMonth() - 1); since = d.toISOString();
      }
      const sinceDate = since.slice(0, 10);

      const [drv, cir, inc, alt, abs, rep, rempl] = await Promise.all([
        supabase.from("conducteurs").select("*, circuit:circuits(*), vehicule:vehicules(*)").order("nom"),
        supabase.from("circuits").select("*, cercle:cercles_scolaires(*)").order("num"),
        supabase.from("incidents").select("*, vehicule:vehicules(*), conducteur:conducteurs(*), circuit:circuits(*)").gte("reported_at", since).order("reported_at", { ascending: false }),
        supabase.from("alertes").select("*").gte("created_at", since).order("created_at", { ascending: false }),
        supabase.from("absences_enfants").select("*, enfant:enfants(*), circuit:circuits(*)").gte("date_absence", sinceDate).order("reported_at", { ascending: false }),
        supabase.from("reparations").select("*, vehicule:vehicules(*)").gte("created_at", since).order("created_at", { ascending: false }),
        supabase.from("absences_conducteurs")
          .select("*, conducteur:conducteurs!conducteur_id(prenom,nom), remplacant:conducteurs!remplacant_id(prenom,nom), circuit:circuits(emoji,nom,num)")
          .gte("date_absence", sinceDate)
          .order("created_at", { ascending: false }),
      ]);
      setDrivers(drv.data ?? []);
      setCircuits(cir.data ?? []);
      setIncidents(inc.data ?? []);
      setAlertes(alt.data ?? []);
      setAbsences(abs.data ?? []);
      setReparations(rep.data ?? []);
      setRemplacements((rempl.data ?? []) as AbsenceConducteur[]);
      setLoading(false);
    };
    load();
  }, [periode]);

  const absents = drivers.filter(d => d.status === "absent");
  const nonCouverts = circuits.filter(c => !drivers.find(d => d.circuit_id === c.id && d.status !== "absent"));
  const alertesCritiques = alertes.filter(a => a.severity === "critique");
  const alertesHautes = alertes.filter(a => a.severity === "haute");
  const repEnCours = reparations.filter(r => ["receptionne","en_attente_piece","en_reparation","repare"].includes(r.statut));

  const periodeLabel = { jour: "Aujourd'hui", semaine: "7 derniers jours", mois: "30 derniers jours" };

  return (
    <div>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${C.navy},${C.navyL})`, borderRadius: 16, padding: "22px 28px",
        color: C.white, marginBottom: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Rapport d'exploitation</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 3, textTransform: "capitalize" }}>{todayStr()}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {(["jour","semaine","mois"] as Periode[]).map(p => (
            <button key={p} onClick={() => setPeriode(p)}
              style={{ padding: "7px 18px", borderRadius: 8, border: `2px solid ${periode === p ? C.sky : "rgba(255,255,255,0.3)"}`,
                background: periode === p ? C.sky : "transparent", color: C.white,
                fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
              {p === "jour" ? "Jour" : p === "semaine" ? "Semaine" : "Mois"}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div> : <>

      {/* Résumé flash */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Absents", val: absents.length, color: absents.length > 0 ? C.red : C.green, icon: <UserX size={28} color={absents.length > 0 ? C.red : C.green} /> },
          { label: "Circuits non couverts", val: nonCouverts.length, color: nonCouverts.length > 0 ? C.red : C.green, icon: <MapPin size={28} color={nonCouverts.length > 0 ? C.red : C.green} /> },
          { label: "Incidents", val: incidents.length, color: incidents.length > 0 ? C.amber : C.green, icon: <AlertCircle size={28} color={incidents.length > 0 ? C.amber : C.green} /> },
          { label: "Alertes critiques", val: alertesCritiques.length, color: alertesCritiques.length > 0 ? C.red : C.green, icon: <Bell size={28} color={alertesCritiques.length > 0 ? C.red : C.green} /> },
        ].map(s => (
          <div key={s.label} style={{ background: C.white, borderRadius: 12, padding: "18px 22px",
            border: `2px solid ${s.val > 0 ? s.color + "60" : C.gray200}`,
            display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center" }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 32, fontWeight: 900, color: s.val > 0 ? s.color : C.gray800 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: C.gray600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Remplacements du jour (section dédiée, visible en mode "jour") ── */}
      {periode === "jour" && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`,
            fontWeight: 700, color: C.gray800, fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}><RefreshCw size={15} /> Remplacements du jour ({remplacements.length})</span>
            {remplacements.length > 0 && (
              <span style={{ fontSize: 12, color: remplacements.every(r => r.remplacant_id) ? C.green : C.amber, fontWeight: 700 }}>
                {remplacements.filter(r => r.status === "couvert").length}/{remplacements.length} couverts
              </span>
            )}
          </div>
          {remplacements.length === 0 ? (
            <div style={{ padding: "20px 18px", textAlign: "center", color: C.green, fontWeight: 600, fontSize: 13 }}>
              Aucun remplacement aujourd'hui
            </div>
          ) : remplacements.map(r => {
            const circ = r.circuit as { emoji?: string; nom?: string; num?: string } | undefined;
            const couvert = !!r.remplacant_id && r.status === "couvert";
            return (
              <div key={r.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`,
                background: couvert ? C.white : C.amberL }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
                  {/* Conducteur absent */}
                  <div style={{ background: C.redL, borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 3, textTransform: "uppercase" }}>
                      Absent
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: C.gray800 }}>
                      {r.conducteur?.prenom} {r.conducteur?.nom}
                    </div>
                    {r.motif && (
                      <div style={{ fontSize: 12, color: C.gray600, marginTop: 3 }}>
                        Motif : {r.motif}
                      </div>
                    )}
                  </div>

                  {/* Flèche + circuit */}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, color: couvert ? C.green : C.amber }}>→</div>
                    {circ && (
                      <div style={{ fontSize: 11, color: C.gray600, fontWeight: 600, marginTop: 2 }}>
                        {circ.emoji} {circ.nom}
                      </div>
                    )}
                  </div>

                  {/* Remplaçant */}
                  <div style={{ background: couvert ? C.greenL : C.gray100, borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: couvert ? C.green : C.gray400, marginBottom: 3, textTransform: "uppercase" }}>
                      {couvert ? "Remplaçant" : "Non couvert"}
                    </div>
                    {couvert ? (
                      <>
                        <div style={{ fontWeight: 800, fontSize: 14, color: C.gray800 }}>
                          {r.remplacant?.prenom} {r.remplacant?.nom}
                        </div>
                        <div style={{ fontSize: 12, color: C.green, marginTop: 3 }}>En service</div>
                      </>
                    ) : (
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.amber }}>À assigner</div>
                    )}
                  </div>
                </div>

                {/* Horodatage */}
                <div style={{ marginTop: 10, fontSize: 11, color: C.gray400 }}>
                  Décision enregistrée à {fmtDateTime(r.created_at)}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

        {/* Conducteurs absents + remplacements */}
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, fontWeight: 700, color: C.gray800, fontSize: 14 }}>
            Conducteurs absents ({absents.length})
          </div>
          {absents.length === 0
            ? <div style={{ padding: 20, textAlign: "center", color: C.green, fontWeight: 600, fontSize: 13 }}>Aucun absent</div>
            : absents.map(d => {
              const circ = circuits.find(c => c.id === d.circuit_id);
              const remplacant = drivers.find(r => r.circuit_id === d.circuit_id && r.id !== d.id && r.status === "en_service");
              return (
                <div key={d.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}` }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                    <Avatar initials={d.photo_initials} color={C.red} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, color: C.gray800 }}>{d.prenom} {d.nom}</div>
                      <div style={{ fontSize: 12, color: C.red }}>Motif : {d.absence_motif || "Non renseigné"}</div>
                    </div>
                  </div>
                  {circ && (
                    <div style={{ background: C.gray50, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                      <span style={{ color: C.gray600 }}>Circuit : </span>
                      <strong>{circ.emoji} {circ.nom}</strong>
                      {remplacant
                        ? <div style={{ marginTop: 4, color: C.green, fontWeight: 600 }}>
                            Remplacé par {remplacant.prenom} {remplacant.nom}
                          </div>
                        : <div style={{ marginTop: 4, color: C.red, fontWeight: 600 }}>Non couvert</div>
                      }
                    </div>
                  )}
                </div>
              );
            })
          }
        </Card>

        {/* Circuits non couverts */}
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, fontWeight: 700, color: C.gray800, fontSize: 14 }}>
            Circuits non couverts ({nonCouverts.length})
          </div>
          {nonCouverts.length === 0
            ? <div style={{ padding: 20, textAlign: "center", color: C.green, fontWeight: 600, fontSize: 13 }}>Tous les circuits sont couverts</div>
            : nonCouverts.map(c => (
              <div key={c.id} style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}`,
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{c.emoji} {c.num}-{c.nom}</div>
                  <div style={{ fontSize: 11, color: C.gray400 }}>{c.cercle?.nom} · {c.enfants_count} enfants</div>
                </div>
                <Badge color="red">Non couvert</Badge>
              </div>
            ))
          }
        </Card>

        {/* Absences enfants */}
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, fontWeight: 700, color: C.gray800, fontSize: 14 }}>
            Absences enfants ({absences.length})
          </div>
          {absences.length === 0
            ? <div style={{ padding: 20, textAlign: "center", color: C.gray400, fontSize: 13 }}>Aucune absence signalée</div>
            : absences.map(a => (
              <div key={a.id} style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtEnfant((a as any).enfant?.prenom, (a as any).enfant?.nom)}</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                  {(a as any).circuit?.emoji} {(a as any).circuit?.nom} · {a.reason} · {fmtDate(a.date_absence)}
                </div>
                <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
                  <Badge color={a.transmitted_to_driver ? "green" : "amber"}>
                    {a.transmitted_to_driver ? "Transmis conducteur" : "À transmettre"}
                  </Badge>
                </div>
              </div>
            ))
          }
        </Card>

        {/* Incidents */}
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, fontWeight: 700, color: C.gray800, fontSize: 14 }}>
            Incidents ({incidents.length})
          </div>
          {incidents.length === 0
            ? <div style={{ padding: 20, textAlign: "center", color: C.gray400, fontSize: 13 }}>Aucun incident</div>
            : incidents.map(i => (
              <div key={i.id} style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{i.description}</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                  {i.conducteur?.prenom} {i.conducteur?.nom} · {i.vehicule?.plaque} · {fmtDateTime(i.reported_at)}
                </div>
                <div style={{ marginTop: 4 }}>
                  <Badge color={i.status === "resolu" ? "green" : i.status === "en_cours" ? "blue" : "amber"}>
                    {i.status === "resolu" ? "Résolu" : i.status === "en_cours" ? "En cours" : "À traiter"}
                  </Badge>
                </div>
              </div>
            ))
          }
        </Card>

        {/* Alertes */}
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, fontWeight: 700, color: C.gray800, fontSize: 14 }}>
            Alertes ({alertes.length})
          </div>
          {alertes.length === 0
            ? <div style={{ padding: 20, textAlign: "center", color: C.gray400, fontSize: 13 }}>Aucune alerte</div>
            : alertes.map(a => (
              <div key={a.id} style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}`,
                background: a.severity === "critique" ? "#FFF5F5" : a.severity === "haute" ? "#FFFBF0" : C.white }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.gray800 }}>{a.message}</div>
                  <Badge color={sevColor(a.severity)}>{sevLabel(a.severity)}</Badge>
                </div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 4, display: "flex", gap: 10 }}>
                  <span>{fmtDateTime(a.created_at)}</span>
                  <Badge color={a.read ? "green" : "gray"}>{a.read ? "Lu" : "Non lu"}</Badge>
                </div>
              </div>
            ))
          }
        </Card>

        {/* Réparations en cours */}
        <Card>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, fontWeight: 700, color: C.gray800, fontSize: 14 }}>
            Réparations ({reparations.length} · {repEnCours.length} en cours)
          </div>
          {reparations.length === 0
            ? <div style={{ padding: 20, textAlign: "center", color: C.gray400, fontSize: 13 }}>Aucune réparation sur la période</div>
            : reparations.map(r => (
              <div key={r.id} style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}`,
                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{(r as any).vehicule?.plaque} — {r.description}</div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                    {fmtDate(r.date_reparation ?? r.date_reception)} · {r.cout != null ? r.cout.toFixed(2) : "—"} CHF
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {(r.cout ?? 0) >= 1000 && <Badge color="red">≥1000 CHF</Badge>}
                  <Badge color={r.statut === "remis_en_circulation" ? "green" : "amber"}>
                    {r.statut === "remis_en_circulation" ? "Terminé" : "En cours"}
                  </Badge>
                </div>
              </div>
            ))
          }
        </Card>
      </div>
      </>}
    </div>
  );
}
