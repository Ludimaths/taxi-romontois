"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import MessagerieBox from "@/components/MessagerieBox";

interface Person { id: string; nom: string; role: string; }

// Espace Référente : point de contact entre la coordination (Amany) d'un côté,
// et Anès (gestionnaire) + les 4 responsables de secteur de l'autre, pour régler
// les soucis. Les responsables sont des conducteurs (est_responsable) : ils sont
// donc fournis en contacts explicites (people) et non par rôle, pour ne pas
// inclure l'ensemble des conducteurs.
export default function ReferentePage() {
  const sb = createClient();
  const [nom, setNom] = useState("");
  const [responsables, setResponsables] = useState<Person[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await sb.auth.getUser();
      if (auth.user) {
        const { data: p } = await sb.from("profiles").select("prenom,nom").eq("id", auth.user.id).single();
        if (p) setNom(`${p.prenom} ${p.nom}`);
      }

      // Responsables de secteur = conducteurs est_responsable → leurs comptes (profiles).
      const { data: conds } = await sb
        .from("conducteurs")
        .select("id,prenom,nom,secteur")
        .eq("est_responsable", true);
      const condIds = (conds ?? []).map(c => c.id);
      if (condIds.length > 0) {
        const { data: profs } = await sb
          .from("profiles")
          .select("id,conducteur_id")
          .in("conducteur_id", condIds);
        const byCond = new Map<number, string>();
        (profs ?? []).forEach(pr => {
          const cid = (pr as { conducteur_id: number | null }).conducteur_id;
          if (cid != null) byCond.set(cid, (pr as { id: string }).id);
        });
        const people: Person[] = (conds ?? [])
          .filter(c => byCond.has(c.id))
          .map(c => ({
            id: byCond.get(c.id) as string,
            nom: `${c.prenom} ${c.nom}${c.secteur ? ` · ${c.secteur}` : ""}`,
            role: "conducteur",
          }));
        setResponsables(people);
      }
      setReady(true);
    })();
  }, [sb]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.navy, margin: 0 }}>Messagerie référente</h1>
        <p style={{ fontSize: 13, color: C.gray400, marginTop: 4 }}>
          Échanges directs avec Anès (gestionnaire) et les responsables de secteur, pour signaler et régler les soucis.
        </p>
      </div>
      {ready && nom ? (
        <MessagerieBox
          myRole="referente"
          myNom={nom}
          allowedTargets={[{ label: "Gestionnaire (Anès)", role: "gestionnaire" }]}
          people={responsables}
        />
      ) : (
        <div style={{ color: C.gray400, textAlign: "center", padding: 40 }}>Chargement…</div>
      )}
    </div>
  );
}
