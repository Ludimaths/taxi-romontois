"use client";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { C } from "@/lib/constants";

export default function InscriptionQRPage() {
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(`${window.location.origin}/inscription`); }, []);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "8px 4px 40px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, margin: "0 0 6px" }}>Inscription des conducteurs</h1>
      <p style={{ fontSize: 14, color: C.gray600, margin: "0 0 20px", lineHeight: 1.5 }}>
        Faites scanner ce QR code par vos conducteurs (par exemple pendant la formation).
        Chacun crée lui-même son compte : il apparaîtra automatiquement dans l&apos;onglet Conducteurs.
      </p>

      <div style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 10px rgba(0,0,0,.06)", padding: 28, textAlign: "center" }}>
        <div style={{ display: "inline-block", padding: 16, background: "#fff", border: `1px solid ${C.gray200}`, borderRadius: 14 }}>
          {url ? <QRCodeSVG value={url} size={240} level="M" /> : <div style={{ width: 240, height: 240 }} />}
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: C.gray600 }}>Ou via le lien :</div>
        <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: C.navy, wordBreak: "break-all" }}>{url}</div>
      </div>

      <div style={{ background: "#EFF6FF", borderRadius: 14, padding: "16px 18px", marginTop: 18 }}>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: 14, marginBottom: 8 }}>Comment ça marche</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "#334155", lineHeight: 1.7 }}>
          <li>Le conducteur scanne le QR code.</li>
          <li>Il saisit son prénom, son nom (son identifiant <b>prenom.nom@taxi-romontois.ch</b> se crée tout seul).</li>
          <li>Il choisit son <b>responsable de secteur</b> — ça le range automatiquement dans le bon secteur.</li>
          <li>Il définit son mot de passe et valide.</li>
          <li>Son compte apparaît aussitôt dans l&apos;onglet <b>Conducteurs</b>. Vous n&apos;avez plus qu&apos;à lui attribuer ses circuits.</li>
        </ol>
      </div>
    </div>
  );
}
