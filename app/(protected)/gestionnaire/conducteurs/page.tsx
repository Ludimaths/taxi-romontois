"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, statusColor, statusLabel } from "@/lib/constants";
import { Badge, Avatar, Card, InfoBox, Btn, SectionTitle, TabBar } from "@/components/ui";
import type { Conducteur, Circuit } from "@/lib/types";

export default function ConducteursPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<Conducteur[]>([]);
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [tab, setTab] = useState("historique");
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [drv, cir] = await Promise.all([
        supabase.from("conducteurs").select("*, circuit:circuits(*,cercle:cercles_scolaires(*)), vehicule:vehicules(*)").order("nom"),
        supabase.from("circuits").select("*, cercle:cercles_scolaires(*)").order("num"),
      ]);
      setDrivers(drv.data ?? []);
      setCircuits(cir.data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = drivers.filter(d =>
    `${d.prenom} ${d.nom} ${d.tel ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const d = sel ? drivers.find(x => x.id === sel) : null;

  const handleStatusChange = async (driverId: number, status: string) => {
    await supabase.from("conducteurs").update({ status, absence_motif: status === "absent" ? "Maladie" : null }).eq("id", driverId);
    setDrivers(prev => prev.map(x => x.id === driverId ? { ...x, status: status as any, absence_motif: status === "absent" ? "Maladie" : undefined } : x));
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", "conducteurs");
    await fetch("/api/import", { method: "POST", body: formData });
    setImporting(false);
    setShowImport(false);
    window.location.reload();
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  if (sel && d) {
    const circ = circuits.find(c => c.id === d.circuit_id);
    const permisExpireSoon = d.permis_exp && new Date(d.permis_exp) < new Date(Date.now() + 90 * 864e5);
    return (
      <div>
        <button onClick={() => setSel(null)} style={{ background: "none", border: "none", color: C.navyL, cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 18, padding: 0 }}>
          ← Tous les conducteurs
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 22 }}>
          <Card style={{ padding: 26 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", padding: 18, background: C.skyL, borderRadius: 12, marginBottom: 20 }}>
              <Avatar initials={d.photo_initials} size={52} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 900, color: C.navy }}>{d.prenom} {d.nom}</div>
                <div style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>{d.tel || "—"} · {d.affectation}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Badge color={statusColor(d.status) as any}>{statusLabel(d.status)}</Badge>
                  {permisExpireSoon && <Badge color="red">⚠ Permis bientôt</Badge>}
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 16 }}>
              <InfoBox label="Véhicule" value={d.vehicule?.plaque} />
              <InfoBox label="Circuit" value={circ ? `${circ.emoji} ${circ.nom}` : "—"} />
              <InfoBox label="Permis" value={d.permis || "—"} highlight={permisExpireSoon ? C.red : undefined} />
              <InfoBox label="Validité permis" value={d.permis_exp ? new Date(d.permis_exp).toLocaleDateString("fr-FR") : "—"} highlight={permisExpireSoon ? C.red : undefined} />
              <InfoBox label="École" value={circ?.cercle?.nom} />
              <InfoBox label="Tachygraphe" value={d.tachygraphe ? "Requis" : "Non requis"} />
              <InfoBox label="Cercle scolaire" value={d.cercle?.nom} full />
            </div>
            <div style={{ marginTop: 14, padding: 14, background: C.gray50, borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.gray800, marginBottom: 8 }}>Modifier le statut</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["en_service", "en_attente", "absent", "disponible"] as const).map(s => (
                  <button key={s} onClick={() => handleStatusChange(d.id, s)}
                    style={{ padding: "7px 12px", borderRadius: 7, border: `2px solid ${d.status === s ? C.navyL : C.gray200}`,
                      background: d.status === s ? C.navyL : C.white, color: d.status === s ? C.white : C.gray600,
                      fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          <Card style={{ padding: 26 }}>
            <TabBar tabs={["historique", "infos"]} active={tab} onChange={setTab} />
            {tab === "historique" && (
              <div style={{ background: C.gray50, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr 1fr", padding: "8px 14px",
                  background: C.gray200, fontSize: 10, fontWeight: 700, color: C.gray600, textTransform: "uppercase" }}>
                  <span>Date</span><span>Circuit</span><span>Début</span><span>Statut</span>
                </div>
                <div style={{ padding: 14, textAlign: "center", color: C.gray400, fontSize: 13 }}>
                  Historique disponible via les logs de service
                </div>
              </div>
            )}
            {tab === "infos" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <InfoBox label="Nom" value={d.nom} />
                <InfoBox label="Prénom" value={d.prenom} />
                <InfoBox label="Téléphone" value={d.tel} />
                <InfoBox label="Affectation" value={d.affectation} />
                <InfoBox label="Notes" value={d.notes} full />
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle title={`Conducteurs (${drivers.length})`} action="⬆ Importer Excel" onAction={() => setShowImport(true)} />
      {showImport && (
        <div style={{ background: C.skyL, borderRadius: 12, padding: 20, marginBottom: 18, border: `1px solid ${C.sky}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Import CSV/Excel conducteurs</div>
          <div style={{ fontSize: 12, color: C.gray600, marginBottom: 12 }}>Format : Nom;Prénom;Téléphone;Affectation;Cercle;Circuit;Véhicule;Permis;Validité</div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleImport}
            style={{ display: "block", marginBottom: 10 }} />
          {importing && <div style={{ color: C.navyL, fontWeight: 700 }}>Import en cours…</div>}
          <Btn small onClick={() => setShowImport(false)} outline color={C.navyL}>Fermer</Btn>
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher conducteur…"
          style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`, fontSize: 13, outline: "none", width: 280 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {filtered.map(d => {
          const circ = circuits.find(c => c.id === d.circuit_id);
          const permisExpireSoon = d.permis_exp && new Date(d.permis_exp) < new Date(Date.now() + 90 * 864e5);
          return (
            <Card key={d.id} onClick={() => setSel(d.id)} style={{ padding: 18 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <Avatar initials={d.photo_initials} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: C.gray800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.prenom} {d.nom}
                  </div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{d.tel || "—"}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Badge color={statusColor(d.status) as any}>{statusLabel(d.status)}</Badge>
                {permisExpireSoon && <Badge color="red">⚠ Permis</Badge>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, fontSize: 12 }}>
                {[
                  ["Véhicule", d.vehicule?.plaque || "—"],
                  ["Circuit", circ ? `${circ.emoji} ${circ.nom}` : "—"],
                  ["Cercle", d.cercle?.nom || "—"],
                  ["Permis", d.permis || "—"],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: C.gray50, borderRadius: 6, padding: "6px 9px" }}>
                    <div style={{ fontSize: 9, color: C.gray400, textTransform: "uppercase" }}>{l}</div>
                    <div style={{ fontWeight: 600, color: C.gray800, marginTop: 1, fontSize: 12 }}>{v}</div>
                  </div>
                ))}
              </div>
              {d.absence_motif && (
                <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 600 }}>Motif : {d.absence_motif}</div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
