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
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 10,
    border: `2px solid ${C.gray200}`,
    fontSize: 16,
    color: "#111827",
    background: "#FFFFFF",
    outline: "none",
    boxSizing: "border-box",
    appearance: "none",
    WebkitAppearance: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 14,
    fontWeight: 700,
    color: "#374151",
    marginBottom: 8,
  };

  return (
    <div style={{ minHeight: "100vh",
      background: "linear-gradient(160deg, #F0F4FF 0%, #E8EFFF 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 16px" }}>

      <div style={{ background: "#FFFFFF", borderRadius: 20, padding: "36px 28px",
        width: "100%", maxWidth: 420,
        boxShadow: "0 12px 48px rgba(13,59,122,0.12)" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo-dark.png" alt="Taxi Romontois"
            style={{ width: 180, maxWidth: "100%", height: "auto",
              margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontSize: 14, color: "#6B7280", fontWeight: 500 }}>
            Transport scolaire · Romont
          </div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Adresse e-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="vous@taxi-romontois.ch"
              autoComplete="email"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 26 }}>
            <label style={labelStyle}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: 10, padding: "12px 16px", marginBottom: 18,
              fontSize: 15, color: "#DC2626", fontWeight: 600 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", minHeight: 58, padding: "16px",
              borderRadius: 12, border: "none",
              background: loading ? "#CBD5E1" : C.navy,
              color: loading ? "#94A3B8" : "#FFFFFF",
              fontWeight: 800, fontSize: 17,
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: 0.3, transition: "background .15s" }}>
            {loading ? "Connexion en cours…" : "Se connecter →"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 22,
          fontSize: 12, color: "#9CA3AF" }}>
          Plateforme réservée au personnel Taxi Romontois
        </div>
      </div>
    </div>
  );
}
