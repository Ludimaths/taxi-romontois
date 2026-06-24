"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Btn, Badge } from "@/components/ui";
import { QRCodeSVG as QRCode } from "qrcode.react";
import type { Vehicule } from "@/lib/types";

const DOMAIN = "https://taxi-romontois.onrender.com";

export default function QRCodesPage() {
  const supabase = createClient();
  const [vehicles, setVehicles] = useState<Vehicule[]>([]);
  const [loading, setLoading] = useState(true);
  const [printId, setPrintId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("vehicules")
        .select("*, circuit:circuits(*), conducteur:conducteurs(*)")
        .order("plaque");
      setVehicles(data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const handlePrintAll = () => {
    setPrintId(null);
    setTimeout(() => window.print(), 100);
  };

  const handlePrintOne = (id: string) => {
    setPrintId(id);
    setTimeout(() => window.print(), 100);
  };

  const vehiclesToPrint = printId ? vehicles.filter(v => v.id === printId) : vehicles;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: C.gray400 }}>Chargement…</div>;

  return (
    <div>
      <style>{`
        #qr-print-area { display: none; }
        @media print {
          body { visibility: hidden; }
          #qr-print-area {
            display: block !important;
            visibility: visible !important;
            position: fixed !important;
            left: 0 !important; top: 0 !important; width: 100% !important;
          }
          #qr-print-area * { visibility: visible !important; }
          .qr-card { page-break-inside: avoid; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header — masqué à l'impression */}
      <div className="no-print" style={{ background: `linear-gradient(135deg,${C.navy},${C.navyL})`,
        borderRadius: 16, padding: "22px 28px", color: C.white, marginBottom: 22,
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>QR Codes Véhicules</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 3 }}>{vehicles.length} véhicules · scan → fiche véhicule</div>
        </div>
        <Btn onClick={handlePrintAll} color={C.sky}>🖨 Imprimer tous les QR codes</Btn>
      </div>

      {/* Grille individuelle avec boutons */}
      <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
        {vehicles.map(v => (
          <div key={v.id} style={{ background: C.white, borderRadius: 12, padding: 18,
            border: `1px solid ${C.gray200}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <QRCode value={`${DOMAIN}/scan/${v.id}`} size={100} level="M" />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: C.navy }}>{v.plaque}</div>
              <div style={{ fontSize: 12, color: C.gray600 }}>{v.marque} {v.modele}</div>
              {v.circuit && <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{v.circuit.emoji} {v.circuit.nom}</div>}
              <div style={{ fontSize: 10, color: C.gray400, marginTop: 6, wordBreak: "break-all", maxWidth: "100%" }}>
                {`${DOMAIN}/scan/${v.id}`}
              </div>
            </div>
            <Btn small onClick={() => handlePrintOne(v.id)} color={C.navyL}>🖨 Imprimer</Btn>
          </div>
        ))}
      </div>

      {/* Zone d'impression — masquée à l'écran, visible en impression */}
      <div id="qr-print-area">
        <style>{`
          .qr-print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
          .qr-card {
            padding: 30px 20px; border: 1px solid #ddd; margin: 0;
            display: flex; flex-direction: column; align-items: center; gap: 12;
            page-break-inside: avoid; min-height: 280px; justify-content: center;
          }
          .qr-card .plate { font-size: 22px; font-weight: 900; color: #0f172a; margin: 0; }
          .qr-card .model { font-size: 13px; color: #64748b; margin: 2px 0 0; }
          .qr-card .circuit { font-size: 12px; color: #94a3b8; margin: 2px 0 0; }
          .qr-card .driver { font-size: 12px; color: #475569; margin: 2px 0 0; }
          .qr-card .url { font-size: 10px; color: #94a3b8; margin-top: 8px; word-break: break-all; }
          @media print {
            #qr-print-area { display: block !important; }
            .qr-print-grid { display: grid !important; }
            @page { margin: 15mm; size: A4; }
          }
        `}</style>
        <div style={{ textAlign: "center", padding: "12px 0 20px", borderBottom: "2px solid #0f172a", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a" }}>Taxi Romontois — QR Codes Véhicules</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Scannez pour accéder à la fiche du véhicule</div>
        </div>
        <div className="qr-print-grid">
          {vehiclesToPrint.map(v => (
            <div key={v.id} className="qr-card">
              <QRCode value={`${DOMAIN}/scan/${v.id}`} size={140} level="M" includeMargin />
              <div style={{ textAlign: "center" }}>
                <p className="plate">{v.plaque}</p>
                <p className="model">{v.marque} {v.modele}</p>
                {v.circuit && <p className="circuit">{v.circuit.emoji} Circuit {v.circuit.num} — {v.circuit.nom}</p>}
                {v.conducteur && <p className="driver">Conducteur : {v.conducteur.prenom} {v.conducteur.nom}</p>}
                <p className="url">{DOMAIN}/scan/{v.id}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
