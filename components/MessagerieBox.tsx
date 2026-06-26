"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Send, Inbox } from "lucide-react";

interface MsgInterne {
  id: number;
  expediteur_id: string;
  expediteur_nom: string;
  expediteur_role: string;
  destinataire_role: string;
  message: string;
  lu: boolean;
  created_at: string;
}

interface Props {
  myRole: string;
  myNom?: string;
  allowedTargets: { label: string; role: string }[];
}

const ROLE_LABELS: Record<string, string> = {
  gestionnaire: "Gestionnaire",
  conducteur: "Conducteur",
  mecanicien: "Mécanicien",
  admin: "Administrateur",
  parent: "Parent",
};

export default function MessagerieBox({ myRole, myNom: myNomProp, allowedTargets }: Props) {
  const sb = createClient();
  const [myId, setMyId] = useState<string | null>(null);
  const [myNom, setMyNom] = useState(myNomProp ?? "");
  const [messages, setMessages] = useState<MsgInterne[]>([]);
  const [selectedTarget, setSelectedTarget] = useState(allowedTargets[0]?.role ?? "");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setMyId(data.user.id);
      if (!myNomProp) {
        const { data: p } = await sb.from("profiles").select("prenom,nom").eq("id", data.user.id).single();
        if (p) setMyNom(`${(p as {prenom:string;nom:string}).prenom} ${(p as {prenom:string;nom:string}).nom}`);
      }
    });
  }, [sb, myNomProp]);

  const fetchMessages = useCallback(async () => {
    if (!myId) return;
    const { data } = await sb
      .from("messages_internes")
      .select("*")
      .or(`expediteur_id.eq.${myId},destinataire_role.eq.${myRole}`)
      .order("created_at", { ascending: true });
    setMessages(data ?? []);
    const unread = (data ?? []).filter(m => !m.lu && m.destinataire_role === myRole && m.expediteur_id !== myId);
    if (unread.length > 0) {
      await sb.from("messages_internes").update({ lu: true }).in("id", unread.map(m => m.id));
    }
  }, [sb, myId, myRole]);

  useEffect(() => {
    if (!myId) return;
    fetchMessages();
    const ch = sb.channel(`msg-${myRole}-${myId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages_internes" }, fetchMessages)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchMessages, sb, myRole, myId]);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [messages, selectedTarget]);

  async function send() {
    if (!text.trim() || !selectedTarget || !myId) return;
    setSending(true);
    await sb.from("messages_internes").insert({
      expediteur_id: myId,
      expediteur_nom: myNom,
      expediteur_role: myRole,
      destinataire_role: selectedTarget,
      message: text.trim(),
    });
    setText("");
    setSending(false);
  }

  const convoMessages = messages.filter(m =>
    (m.expediteur_id === myId && m.destinataire_role === selectedTarget) ||
    (m.destinataire_role === myRole && m.expediteur_role === selectedTarget)
  );

  function groupByDay(msgs: MsgInterne[]) {
    const groups: Record<string, MsgInterne[]> = {};
    msgs.forEach(m => {
      const day = m.created_at.slice(0, 10);
      if (!groups[day]) groups[day] = [];
      groups[day].push(m);
    });
    return Object.entries(groups);
  }

  function fmtDay(iso: string) {
    const d = new Date(iso + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);
    if (d.getTime() === today.getTime()) return "Aujourd'hui";
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (d.getTime() === yesterday.getTime()) return "Hier";
    return d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" });
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
  }

  const unreadCount = messages.filter(m => !m.lu && m.destinataire_role === myRole && m.expediteur_id !== myId).length;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Sélecteur de conversation */}
      {allowedTargets.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {allowedTargets.map(t => {
            const tUnread = messages.filter(m => !m.lu && m.destinataire_role === myRole && m.expediteur_role === t.role && m.expediteur_id !== myId).length;
            return (
              <button key={t.role} onClick={() => setSelectedTarget(t.role)}
                style={{ padding: "8px 16px", borderRadius: 20, border: "none", cursor: "pointer",
                  fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6,
                  background: selectedTarget === t.role ? C.navy : C.gray100,
                  color: selectedTarget === t.role ? C.white : C.gray600 }}>
                {t.label}
                {tUnread > 0 && (
                  <span style={{ background: C.red, color: C.white, borderRadius: 99,
                    padding: "1px 6px", fontSize: 10, fontWeight: 900 }}>{tUnread}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {allowedTargets.length === 1 && unreadCount > 0 && (
        <div style={{ marginBottom: 10, fontSize: 13, color: C.red, fontWeight: 700 }}>
          {unreadCount} nouveau(x) message(s)
        </div>
      )}

      {/* Fil de messages */}
      <div style={{ background: C.gray50, borderRadius: 16, padding: "16px 14px",
        minHeight: 180, maxHeight: 380, overflowY: "auto", marginBottom: 12,
        display: "flex", flexDirection: "column", gap: 4,
        border: `1px solid ${C.gray200}` }}>
        {convoMessages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: C.gray400 }}>
            <Inbox size={32} strokeWidth={1} style={{ margin: "0 auto 8px", display: "block" }} />
            <p style={{ fontSize: 13, fontWeight: 600 }}>Démarrez la conversation</p>
          </div>
        ) : groupByDay(convoMessages).map(([day, msgs]) => (
          <div key={day}>
            <div style={{ textAlign: "center", margin: "8px 0" }}>
              <span style={{ fontSize: 11, color: C.gray400, fontWeight: 700,
                background: C.gray200, borderRadius: 99, padding: "2px 10px" }}>
                {fmtDay(day)}
              </span>
            </div>
            {msgs.map(m => {
              const isMine = m.expediteur_id === myId;
              return (
                <div key={m.id} style={{ display: "flex",
                  justifyContent: isMine ? "flex-end" : "flex-start",
                  marginBottom: 6 }}>
                  <div style={{ maxWidth: "78%",
                    background: isMine ? C.navy : C.white,
                    color: isMine ? C.white : C.gray800,
                    borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    padding: "10px 14px",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                    {!isMine && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.navyL, marginBottom: 4 }}>
                        {m.expediteur_nom || ROLE_LABELS[m.expediteur_role] || m.expediteur_role}
                      </div>
                    )}
                    <div style={{ fontSize: 14, lineHeight: 1.5 }}>{m.message}</div>
                    <div style={{ fontSize: 10, marginTop: 4, textAlign: "right",
                      color: isMine ? "rgba(255,255,255,0.55)" : C.gray400 }}>
                      {fmtTime(m.created_at)}
                      {isMine && <span style={{ marginLeft: 5 }}>{m.lu ? "✓✓" : "✓"}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Zone de saisie */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={`Message à ${allowedTargets.find(t => t.role === selectedTarget)?.label ?? selectedTarget}…`}
          style={{ flex: 1, padding: "12px 16px", borderRadius: 12,
            border: `2px solid ${C.gray200}`, fontSize: 14,
            background: C.white, outline: "none", color: C.gray800 }}
        />
        <button onClick={send} disabled={sending || !text.trim() || !myId}
          style={{ padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer",
            background: text.trim() && myId ? C.navy : C.gray200,
            color: text.trim() && myId ? C.white : C.gray400,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s" }}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
