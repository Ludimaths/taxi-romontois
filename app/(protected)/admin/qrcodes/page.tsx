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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("vehicules")
        .select("id, plaque, marque, modele, qr_token")
        .order("plaque");
      setVehicles((data ?? []) as QrVehicule[]);
      setLoading(false);
    };
    load();
  }, [supabase]);

  if (loading)
    return <div style={{ padding: 40, textAlign: "center", color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .print-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 16px; }
          .print-card { border: 1px solid #ccc; border-radius: 8px; padding: 12px; text-align: center; page-break-inside: avoid; }
        }
      `}</style>

      {/* Header — masqué à l'impression */}
      <div className="no-print" style={{ background: `linear-gradient(135deg,${C.navy},${C.navyL})`,
        borderRadius: 16, padding: "22px 28px", color: C.white, marginBottom: 22,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>QR Codes Véhicules</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 3 }}>
            {vehicles.length} véhicules · scan → fiche véhicule
          </div>
        </div>
        <Btn onClick={() => window.print()} color={C.sky}>Imprimer les 24 QR codes</Btn>
      </div>

      {/* Grille 4×6 — visible à l'écran ET à l'impression */}
      <div className="print-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {vehicles.map(v => (
          <div key={v.id} className="print-card" style={{ background: C.white, borderRadius: 8,
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
                (pas de QR)
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
