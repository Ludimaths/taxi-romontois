"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Send, Inbox, ChevronLeft } from "lucide-react";

interface MsgInterne {
  id: number;
  expediteur_id: string;
  expediteur_nom: string;
  expediteur_role: string;
  destinataire_role: string;
  destinataire_id: string | null;
  message: string;
  lu: boolean;
  created_at: string;
}

interface Person {
  id: string;
  nom: string;
}

interface Props {
  myRole: string;
  myNom?: string;
  allowedTargets: { label: string; role: string }[];
}

const ROLE_LABELS: Record<string, string> = {
  gestionnaire: "Gestionnaire",
  conducteur:   "Conducteur",
  mecanicien:   "Mécanicien",
  admin:        "Administrateur",
  parent:       "Parent",
};

export default function MessagerieBox({ myRole, myNom: myNomProp, allowedTargets }: Props) {
  const sb = createClient();
  const [myId,           setMyId]           = useState<string | null>(null);
  const [myNom,          setMyNom]          = useState(myNomProp ?? "");
  const [messages,       setMessages]       = useState<MsgInterne[]>([]);
  const [selectedTarget, setSelectedTarget] = useState(allowedTargets[0]?.role ?? "");
  const [persons,        setPersons]        = useState<Record<string, Person[]>>({});
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [text,           setText]           = useState("");
  const [sending,        setSending]        = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Identité utilisateur
  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setMyId(data.user.id);
      if (!myNomProp) {
        const { data: p } = await sb.from("profiles").select("prenom,nom").eq("id", data.user.id).single();
        if (p) setMyNom(`${(p as { prenom: string; nom: string }).prenom} ${(p as { prenom: string; nom: string }).nom}`);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chargement des personnes pour chaque rôle cible
  useEffect(() => {
    const roles = allowedTargets.map(t => t.role);
    sb.from("profiles")
      .select("id, prenom, nom, role")
      .in("role", roles)
      .then(({ data }) => {
        if (!data) return;
        const grouped: Record<string, Person[]> = {};
        for (const p of data) {
          const r = p.role as string;
          if (!grouped[r]) grouped[r] = [];
          grouped[r].push({ id: p.id as string, nom: `${p.prenom} ${p.nom}` });
        }
        Object.values(grouped).forEach(arr => arr.sort((a, b) => a.nom.localeCompare(b.nom, "fr")));
        setPersons(grouped);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sélection si une seule personne dans le rôle
  useEffect(() => {
    const rolePersons = persons[selectedTarget] ?? [];
    if (rolePersons.length === 1) {
      setSelectedPerson(rolePersons[0]);
    } else {
      setSelectedPerson(null);
    }
  }, [selectedTarget, persons]);

  const fetchMessages = useCallback(async () => {
    if (!myId) return;
    const { data } = await sb
      .from("messages_internes")
      .select("*")
      .or(`expediteur_id.eq.${myId},destinataire_role.eq.${myRole}`)
      .order("created_at", { ascending: true });
    const msgs = (data ?? []) as MsgInterne[];
    setMessages(msgs);
    // Marquer comme lus les messages qui me sont adressés
    const unread = msgs.filter(m =>
      !m.lu &&
      m.destinataire_role === myRole &&
      m.expediteur_id !== myId &&
      (m.destinataire_id === myId || !m.destinataire_id)
    );
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
  }, [messages, selectedTarget, selectedPerson]);

  async function send() {
    if (!text.trim() || !selectedTarget || !myId) return;
    const rolePersons = persons[selectedTarget] ?? [];
    if (rolePersons.length > 1 && !selectedPerson) return;
    setSending(true);
    await sb.from("messages_internes").insert({
      expediteur_id:    myId,
      expediteur_nom:   myNom,
      expediteur_role:  myRole,
      destinataire_role: selectedTarget,
      destinataire_id:  selectedPerson?.id ?? null,
      message:          text.trim(),
    });
    setText("");
    setSending(false);
  }

  // Filtre de conversation selon la personne sélectionnée
  const convoMessages = messages.filter(m => {
    if (selectedPerson) {
      return (
        (m.expediteur_id === myId && (m.destinataire_id === selectedPerson.id || (m.destinataire_role === selectedTarget && !m.destinataire_id))) ||
        (m.expediteur_id === selectedPerson.id && m.destinataire_role === myRole && (m.destinataire_id === myId || !m.destinataire_id))
      );
    }
    return (
      (m.expediteur_id === myId && m.destinataire_role === selectedTarget && !m.destinataire_id) ||
      (m.destinataire_role === myRole && m.expediteur_role === selectedTarget && !m.destinataire_id)
    );
  });

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
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return "Aujourd'hui";
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (d.getTime() === yesterday.getTime()) return "Hier";
    return d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" });
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
  }

  const unreadCount = messages.filter(m =>
    !m.lu && m.destinataire_role === myRole && m.expediteur_id !== myId &&
    (m.destinataire_id === myId || !m.destinataire_id)
  ).length;

  const rolePersons    = persons[selectedTarget] ?? [];
  const needsPersonPick = rolePersons.length > 1 && !selectedPerson;
  const canSend        = !!text.trim() && !!myId && (rolePersons.length === 0 || !!selectedPerson);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* Onglets rôles */}
      {allowedTargets.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {allowedTargets.map(t => {
            const tUnread = messages.filter(m =>
              !m.lu && m.destinataire_role === myRole && m.expediteur_role === t.role && m.expediteur_id !== myId
            ).length;
            return (
              <button key={t.role}
                onClick={() => { setSelectedTarget(t.role); setSelectedPerson(null); }}
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

      {/* Fil de retour vers la liste (si personne sélectionnée parmi plusieurs) */}
      {selectedPerson && rolePersons.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <button onClick={() => setSelectedPerson(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.navyL,
              display: "flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 13, padding: 0 }}>
            <ChevronLeft size={16} />{ROLE_LABELS[selectedTarget] ?? selectedTarget}
          </button>
          <span style={{ fontSize: 13, color: C.gray400 }}>›</span>
          <span style={{ fontWeight: 800, fontSize: 13, color: C.navy }}>{selectedPerson.nom}</span>
        </div>
      )}

      {needsPersonPick ? (
        /* Liste de sélection de personne */
        <div style={{ background: C.gray50, borderRadius: 16, border: `1px solid ${C.gray200}`,
          overflow: "hidden", marginBottom: 12 }}>
          <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: C.gray400,
            textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${C.gray200}` }}>
            Sélectionner un {(ROLE_LABELS[selectedTarget] ?? selectedTarget).toLowerCase()}
          </div>
          {rolePersons.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: C.gray400, fontSize: 13 }}>
              Aucun {(ROLE_LABELS[selectedTarget] ?? selectedTarget).toLowerCase()} enregistré pour le moment
            </div>
          ) : rolePersons.map(p => (
            <button key={p.id} onClick={() => setSelectedPerson(p)}
              style={{ width: "100%", padding: "12px 16px", border: "none",
                borderBottom: `1px solid ${C.gray100}`, background: C.white,
                cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 12, transition: "background .12s" }}
              onMouseEnter={e => { e.currentTarget.style.background = C.skyL; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.white; }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.navy,
                color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                {p.nom.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>{p.nom}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* Nom de la personne auto-sélectionnée (rôle avec 1 seul utilisateur) */}
          {selectedPerson && rolePersons.length === 1 && (
            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: C.gray600,
              display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.navy,
                color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 11 }}>
                {selectedPerson.nom.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
              </div>
              {selectedPerson.nom}
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
              placeholder={selectedPerson
                ? `Message à ${selectedPerson.nom}…`
                : `Message à ${allowedTargets.find(t => t.role === selectedTarget)?.label ?? selectedTarget}…`}
              style={{ flex: 1, padding: "12px 16px", borderRadius: 12,
                border: `2px solid ${C.gray200}`, fontSize: 14,
                background: C.white, outline: "none", color: C.gray800 }}
            />
            <button onClick={send} disabled={sending || !canSend}
              style={{ padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer",
                background: canSend ? C.navy : C.gray200,
                color: canSend ? C.white : C.gray400,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s" }}>
              <Send size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
