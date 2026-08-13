"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";

type Resp = { id: number; prenom: string; nom: string; secteur: string | null };

const cleanPart = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, ".");

export default function InscriptionPage() {
  const router = useRouter();
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [respId, setRespId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [responsables, setResponsables] = useState<Resp[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/inscription").then(r => r.json()).then(d => {
      if (Array.isArray(d.responsables)) setResponsables(d.responsables);
    }).catch(() => { /* liste indisponible : on laisse vide */ });
  }, []);

  const email = prenom && nom ? `${cleanPart(prenom)}.${cleanPart(nom)}@taxi-romontois.ch` : "";
  const resp = responsables.find(r => String(r.id) === respId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!prenom.trim() || !nom.trim()) { setError("Indiquez votre prénom et votre nom."); return; }
    if (!respId) { setError("Choisissez votre responsable de secteur."); return; }
    if (password.length < 8) { setError("Le mot de passe doit faire au moins 8 caractères."); return; }
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas."); return; }

    setBusy(true);
    try {
      const res = await fetch("/api/inscription", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prenom: prenom.trim(), nom: nom.trim(), tel: tel.trim(), secteur: resp?.secteur ?? null, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Une erreur est survenue."); setBusy(false); return; }

      // Connexion automatique avec le mot de passe choisi
      const supabase = createClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: data.email, password });
      if (signErr) {
        setDone(true); setBusy(false);   // compte créé mais connexion à refaire manuellement
        return;
      }
      router.push("/conducteur");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${C.gray200}`,
    fontSize: 15, boxSizing: "border-box", background: "#fff",
  };
  const label: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 700, color: C.gray600, margin: "0 0 5px 2px" };

  if (done) {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: 40, textAlign: "center" }}>✅</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: C.navy, textAlign: "center", margin: "8px 0" }}>Compte créé</h1>
          <p style={{ fontSize: 14, color: C.gray600, textAlign: "center", lineHeight: 1.5 }}>
            Votre identifiant est <b>{email}</b>.<br />Connectez-vous avec le mot de passe que vous venez de choisir.
          </p>
          <button onClick={() => router.push("/login")} style={{ ...btn, marginTop: 16 }}>Aller à la connexion</button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <form onSubmit={handleSubmit} style={card}>
        <img src="/logo.png" alt="Taxi Romontois" style={{ height: 40, display: "block", margin: "0 auto 6px" }} />
        <h1 style={{ fontSize: 21, fontWeight: 900, color: C.navy, textAlign: "center", margin: "0 0 4px" }}>Créer mon compte conducteur</h1>
        <p style={{ fontSize: 13, color: C.gray, textAlign: "center", margin: "0 0 18px" }}>Renseignez vos informations pour accéder à votre espace.</p>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}><span style={label}>Prénom *</span><input style={input} value={prenom} onChange={e => setPrenom(e.target.value)} /></div>
          <div style={{ flex: 1 }}><span style={label}>Nom *</span><input style={input} value={nom} onChange={e => setNom(e.target.value)} /></div>
        </div>

        {email && (
          <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "9px 12px", marginBottom: 12, fontSize: 13, color: C.navy }}>
            Votre identifiant : <b>{email}</b>
          </div>
        )}

        <div style={{ marginBottom: 12 }}><span style={label}>Téléphone</span><input style={input} value={tel} onChange={e => setTel(e.target.value)} placeholder="079 000 00 00" /></div>

        <div style={{ marginBottom: 12 }}>
          <span style={label}>Responsable de secteur *</span>
          <select style={input} value={respId} onChange={e => setRespId(e.target.value)}>
            <option value="">— Choisir —</option>
            {responsables.map(r => (
              <option key={r.id} value={r.id}>{r.prenom} {r.nom}{r.secteur ? ` — ${r.secteur}` : ""}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><span style={label}>Mot de passe *</span><input type="password" style={input} value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères min." /></div>
          <div style={{ flex: 1 }}><span style={label}>Confirmer *</span><input type="password" style={input} value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
        </div>

        {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{error}</div>}

        <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
          {busy ? "Création…" : "Créer mon compte"}
        </button>
      </form>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: "100vh", background: C.gray50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const card: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 26, width: "100%", maxWidth: 440, boxShadow: "0 10px 40px rgba(13,59,122,0.12)" };
const btn: React.CSSProperties = { width: "100%", padding: 13, background: C.navy, color: "#fff", borderRadius: 10, border: "none", fontSize: 15.5, fontWeight: 800 };
