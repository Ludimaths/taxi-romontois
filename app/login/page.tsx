"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg,${C.navy},${C.navyL})`,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.white, borderRadius: 20, padding: 40, width: "100%", maxWidth: 420,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.png" alt="Taxi Romontois"
            style={{ width: 180, maxWidth: "100%", height: "auto", margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontSize: 13, color: C.gray400 }}>Transport scolaire</div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.gray600,
              textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Email
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="vous@taxi-romontois.ch"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                fontSize: 14, outline: "none", boxSizing: "border-box",
                background: C.gray50 }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.gray600,
              textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Mot de passe
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                fontSize: 14, outline: "none", boxSizing: "border-box",
                background: C.gray50 }} />
          </div>
          {error && (
            <div style={{ background: C.redL, border: `1px solid #FCA5A5`, borderRadius: 8,
              padding: "10px 14px", marginBottom: 16, fontSize: 13, color: C.red, fontWeight: 600 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "13px", borderRadius: 8, border: "none",
              background: loading ? C.gray200 : C.navyL, color: loading ? C.gray400 : C.white,
              fontWeight: 800, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
              transition: "background .15s" }}>
            {loading ? "Connexion…" : "Se connecter →"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.gray400 }}>
          Plateforme réservée au personnel Taxi Romontois
        </div>
      </div>
    </div>
  );
}
