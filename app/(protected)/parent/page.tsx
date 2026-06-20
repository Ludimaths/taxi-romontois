"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, nowStr } from "@/lib/constants";
import { Badge, Card, InfoBox, Btn } from "@/components/ui";
import type { Enfant, AbsenceEnfant, Circuit } from "@/lib/types";

export default function ParentPage() {
  const supabase = createClient();
  const [child, setChild] = useState<Enfant | null>(null);
  const [circuit, setCircuit] = useState<Circuit | null>(null);
  const [absences, setAbsences] = useState<AbsenceEnfant[]>([]);
  const [motif, setMotif] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("enfant_id").eq("id", user.id).single();
      if (!profile?.enfant_id) return;

      const [enf, abs] = await Promise.all([
        supabase.from("enfants").select("*, circuit:circuits(*,cercle:cercles_scolaires(*))").eq("id", profile.enfant_id).single(),
        supabase.from("absences_enfants").select("*").eq("enfant_id", profile.enfant_id).order("reported_at", { ascending: false }).limit(10),
      ]);
      setChild(enf.data);
      setCircuit((enf.data as any)?.circuit ?? null);
      setAbsences(abs.data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const handleSend = async () => {
    if (!child || !motif) return;
    await supabase.from("absences_enfants").insert({
      enfant_id: child.id,
      circuit_id: child.circuit_id,
      date_absence: new Date().toISOString().slice(0, 10),
      reason: motif,
      reported_by: "Parent",
      read_by_gestionnaire: false,
      transmitted_to_driver: false,
    });
    setSent(true);
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;
  if (!child) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Aucun enfant associé à votre compte. Contactez le gestionnaire.</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#065F46,#059669)", borderRadius: 16, padding: "22px 26px", color: C.white, marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Espace Parent</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 3 }}>Signalement · {child.prenom} {child.nom}</div>
      </div>

      {/* Infos enfant */}
      <Card style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Mon enfant : {child.prenom} {child.nom}</div>
        <div style={{ fontSize: 13, color: C.gray600, marginBottom: 14 }}>
          {circuit ? `${circuit.emoji} Circuit ${circuit.nom}` : "—"} · {circuit?.cercle?.nom}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          <InfoBox label="Circuit" value={circuit ? `${circuit.emoji} ${circuit.nom}` : "—"} />
          <InfoBox label="École" value={circuit?.cercle?.nom} />
          <InfoBox label="Adresse mère" value={child.adresse_mere} />
          <InfoBox label="Adresse père" value={child.adresse_pere || "—"} />
        </div>
      </Card>

      {/* Signalement */}
      {!sent ? (
        <Card style={{ padding: 22, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Signaler une absence ou modification</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {["Absent aujourd'hui", "Malade", "Chez le père", "Chez la mère", "Ne rentre pas ce soir", "Changement exceptionnel"].map(m => (
              <button key={m} onClick={() => setMotif(m)}
                style={{ padding: "10px 12px", borderRadius: 9, border: `2px solid ${motif === m ? C.navyL : C.gray200}`,
                  background: motif === m ? C.skyL : C.white, color: motif === m ? C.navy : C.gray600,
                  fontWeight: 700, cursor: "pointer", fontSize: 12, textAlign: "left" }}>
                {motif === m ? "✓ " : ""}{m}
              </button>
            ))}
          </div>
          <Btn full onClick={handleSend} disabled={!motif} color={C.navyL}>📨 Envoyer la notification</Btn>
        </Card>
      ) : (
        <div style={{ background: C.greenL, borderRadius: 10, padding: 18, marginBottom: 16, border: `1px solid #86EFAC` }}>
          <div style={{ fontWeight: 700, color: C.green, fontSize: 14 }}>✅ Notification envoyée</div>
          <div style={{ fontSize: 13, color: C.gray600, marginTop: 4 }}>
            Le gestionnaire et le conducteur ont été informés. Motif : {motif}
          </div>
          <button onClick={() => { setSent(false); setMotif(""); }} style={{ marginTop: 10, background: "none", border: "none", color: C.navyL, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            + Signaler autre chose
          </button>
        </div>
      )}

      {/* Historique */}
      <Card style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Historique de {child.prenom}</div>
        {absences.length === 0
          ? <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: 16 }}>✅ Aucune absence enregistrée</div>
          : absences.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.gray100}` }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{new Date(a.date_absence).toLocaleDateString("fr-FR")}</span>
                <span style={{ fontSize: 12, color: C.gray400, marginLeft: 8 }}>{a.reason}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Badge color={a.transmitted_to_driver ? "green" : "amber"}>{a.transmitted_to_driver ? "Transmis" : "En attente"}</Badge>
              </div>
            </div>
          ))
        }
      </Card>
    </div>
  );
}
