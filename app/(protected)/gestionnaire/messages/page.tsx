"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import MessagerieBox from "@/components/MessagerieBox";

const GEST_TARGETS = [
  { label: "Conducteurs", role: "conducteur" },
  { label: "Mécanicien",  role: "mecanicien" },
  { label: "Admin",       role: "admin" },
  { label: "Parents",     role: "parent" },
];

export default function GestionnaireMessagesPage() {
  const sb = createClient();
  const [nom, setNom] = useState("");

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: p } = await sb.from("profiles").select("prenom,nom").eq("id", data.user.id).single();
      if (p) setNom(`${p.prenom} ${p.nom}`);
    });
  }, [sb]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, margin: 0 }}>Messagerie interne</h1>
        <p style={{ fontSize: 13, color: C.gray400, marginTop: 4 }}>
          Communication directe avec les conducteurs, le mécanicien et l'administration.
        </p>
      </div>
      {nom ? (
        <MessagerieBox myRole="gestionnaire" myNom={nom} allowedTargets={GEST_TARGETS} />
      ) : (
        <div style={{ color: C.gray400, textAlign: "center", padding: 40 }}>Chargement…</div>
      )}
    </div>
  );
}
