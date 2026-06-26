"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Btn } from "@/components/ui";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://taxi-romontois.onrender.com";

interface QrVehicule {
  id: string;
  plaque: string;
  marque: string;
  modele: string;
  qr_token: string | null;
}

function qrSrc(token: string) {
  const data = encodeURIComponent(`${APP_URL}/scan/${token}`);
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${data}`;
}

export default function QRCodesPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<QrVehicule[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [genCount, setGenCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("vehicules")
        .select("id, plaque, marque, modele, qr_token")
        .order("plaque");
      const list = (data ?? []) as QrVehicule[];

      // Auto-générer les tokens manquants
      const missing = list.filter(v => !v.qr_token);
      if (missing.length > 0) {
        await Promise.all(missing.map(v => {
          const token = crypto.randomUUID();
          return supabase.from("vehicules").update({ qr_token: token }).eq("id", v.id)
            .then(() => { v.qr_token = token; });
        }));
        setGenCount(missing.length);
      }

      setVehicles(list);
      setLoading(false);
    };
    load();
  }, [supabase]);

  if (loading)
    return <div style={{ padding: 40, textAlign: "center", color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      {/* Header — masqué à l'impression */}
      <div className="no-print" style={{ background: `linear-gradient(135deg,${C.navy},${C.navyL})`,
        borderRadius: 16, padding: "22px 28px", color: C.white, marginBottom: 22,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>QR Codes Véhicules</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 3 }}>
            {vehicles.length} véhicules · scan → fiche véhicule
            {genCount > 0 && ` · ${genCount} token${genCount > 1 ? "s" : ""} généré${genCount > 1 ? "s" : ""}`}
          </div>
        </div>
        <Btn onClick={() => window.print()} color={C.sky}>Imprimer les {vehicles.length} QR codes</Btn>
      </div>

      {/* Grille 4 colonnes — visible à l'écran ET à l'impression via globals.css */}
      <div className="qr-print-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {vehicles.map(v => (
          <div key={v.id} className="qr-print-card" style={{ background: C.white, borderRadius: 8,
            padding: 12, border: `1px solid ${C.gray200}`, textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: C.navy }}>{v.plaque}</div>
            <div style={{ fontSize: 12, color: C.gray600 }}>{v.marque} {v.modele}</div>
            {v.qr_token ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrSrc(v.qr_token)} alt={`QR ${v.plaque}`} width={150} height={150}
                style={{ display: "block" }} />
            ) : (
              <div style={{ width: 150, height: 150, display: "flex", alignItems: "center",
                justifyContent: "center", background: C.gray50, borderRadius: 8,
                color: C.gray400, fontSize: 12, fontWeight: 700 }}>
                Génération…
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
