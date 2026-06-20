"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Badge, Card, Btn, SectionTitle } from "@/components/ui";
import type { Alerte } from "@/lib/types";

export default function AlertesPage() {
  const supabase = createClient();
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlertes = async () => {
    const { data } = await supabase.from("alertes").select("*").order("created_at", { ascending: false });
    setAlertes(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAlertes(); }, []);

  const handleMarkRead = async (id: number) => {
    await supabase.from("alertes").update({ read: true, read_at: new Date().toISOString() }).eq("id", id);
    fetchAlertes();
  };

  const handleMarkAllRead = async () => {
    await supabase.from("alertes").update({ read: true, read_at: new Date().toISOString() }).eq("read", false);
    fetchAlertes();
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.gray400 }}>Chargement…</div>;

  const unread = alertes.filter(a => !a.read);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.gray800, margin: 0 }}>
          Alertes {unread.length > 0 && <span style={{ color: C.red }}>({unread.length} non lues)</span>}
        </h2>
        {unread.length > 0 && <Btn small onClick={handleMarkAllRead} color={C.green}>✓ Tout marquer lu</Btn>}
      </div>
      <Card>
        {alertes.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: C.gray400, fontSize: 13 }}>✅ Aucune alerte</div>
        )}
        {alertes.map(a => (
          <div key={a.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`,
            background: a.read ? C.white : C.skyL, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ fontSize: 22 }}>{a.type === "document" ? "📄" : a.type === "vehicule" ? "🚌" : "🔔"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: a.read ? 400 : 700, fontSize: 13, color: C.gray800 }}>{a.message}</div>
              <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{new Date(a.created_at).toLocaleDateString("fr-FR")}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge color={a.severity === "critique" ? "red" : a.severity === "haute" ? "amber" : "gray"}>
                {a.severity === "critique" ? "Critique" : a.severity === "haute" ? "Haute" : "Normale"}
              </Badge>
              {!a.read && <Btn small onClick={() => handleMarkRead(a.id)} color={C.green}>Lu ✓</Btn>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
