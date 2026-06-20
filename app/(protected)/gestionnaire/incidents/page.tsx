"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Badge, Card, Btn, SectionTitle } from "@/components/ui";
import type { Incident } from "@/lib/types";

const ICON_MAP: Record<string, string> = { panne: "🔧", retard: "⏱", probleme_enfant: "👶", accident: "🚨" };
const RESPS = ["Continuer le service", "Arrêter le véhicule", "Changer de véhicule", "Rentrer au dépôt", "Contacter le parent", "Contacter l'école", "Envoyer au garage"];

export default function IncidentsPage() {
  const supabase = createClient();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [resp, setResp] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchIncidents = async () => {
    const { data } = await supabase.from("incidents")
      .select("*, vehicule:vehicules(*), conducteur:conducteurs(*), circuit:circuits(*)")
      .order("reported_at", { ascending: false });
    setIncidents(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchIncidents(); }, []);

  const inc = sel ? incidents.find(i => i.id === sel) : null;

  const handleResolve = async () => {
    if (!sel || !resp) return;
    await supabase.from("incidents").update({ status: "resolu", response: resp, resolved_at: new Date().toISOString() }).eq("id", sel);
    setSel(null);
    setResp("");
    fetchIncidents();
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      <SectionTitle title={`Incidents (${incidents.length})`} />
      <div style={{ display: "grid", gridTemplateColumns: sel ? "1fr 1fr" : "1fr", gap: 18 }}>
        <Card>
          {incidents.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: C.gray400, fontSize: 13 }}>✅ Aucun incident enregistré</div>
          )}
          {incidents.map(i => (
            <div key={i.id} onClick={() => setSel(i.id)}
              style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, cursor: "pointer",
                background: sel === i.id ? C.skyL : C.white, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: C.gray100,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {ICON_MAP[i.type] ?? "⚡"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.gray800 }}>{i.description}</span>
                  <Badge color={i.status === "resolu" ? "green" : i.status === "en_cours" ? "blue" : "amber"}>
                    {i.status === "resolu" ? "Résolu" : i.status === "en_cours" ? "En cours" : "À traiter"}
                  </Badge>
                </div>
                <div style={{ fontSize: 11, color: C.gray400 }}>
                  {i.conducteur?.prenom} {i.conducteur?.nom} · {i.vehicule?.plaque} · {i.circuit?.emoji} {i.circuit?.nom} · {new Date(i.reported_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </div>
                {i.response && <div style={{ fontSize: 11, color: C.navyL, marginTop: 3, fontWeight: 600 }}>✅ {i.response}</div>}
              </div>
            </div>
          ))}
        </Card>

        {sel && inc && (
          <Card style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Gérer l'incident</div>
              <button onClick={() => setSel(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.gray400 }}>×</button>
            </div>
            <div style={{ background: C.gray50, borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{ICON_MAP[inc.type] ?? "⚡"}</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{inc.description}</div>
              <div style={{ fontSize: 11, color: C.gray400 }}>
                {inc.conducteur?.prenom} {inc.conducteur?.nom} · {inc.vehicule?.plaque} · {new Date(inc.reported_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            {inc.status !== "resolu" ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Instruction</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
                  {RESPS.map(r => (
                    <button key={r} onClick={() => setResp(r)}
                      style={{ padding: "9px 13px", borderRadius: 8, fontSize: 12, textAlign: "left",
                        border: `2px solid ${resp === r ? C.navy : C.gray200}`,
                        background: resp === r ? "#EEF2FF" : C.white,
                        color: resp === r ? C.navy : C.gray600, cursor: "pointer", fontWeight: resp === r ? 700 : 400 }}>
                      {r}
                    </button>
                  ))}
                </div>
                <Btn full onClick={handleResolve} disabled={!resp} color={C.navyL}>✅ Envoyer & résoudre</Btn>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700, color: C.green }}>Résolu</div>
                <div style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>{inc.response}</div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
