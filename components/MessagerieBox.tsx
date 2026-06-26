"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/lib/constants";
import { Send, MessageSquare, Search, ArrowLeft } from "lucide-react";

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
  role: string;
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
  const [allPersons,     setAllPersons]     = useState<Person[]>([]);
  const [messages,       setMessages]       = useState<MsgInterne[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [text,           setText]           = useState("");
  const [sending,        setSending]        = useState(false);

  // Mobile state (tâche 3)
  const [isMobile,  setIsMobile]  = useState(false);
  const [showConvo, setShowConvo] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Détection mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Identité
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

  // Chargement de tous les contacts avec fallback (tâche 4)
  useEffect(() => {
    const roles = allowedTargets.map(t => t.role);
    sb.from("profiles")
      .select("id,prenom,nom,role")
      .in("role", roles)
      .then(({ data, error }) => {
        if (error) { console.error("[MessagerieBox] contacts:", error.message); }
        if (!data || data.length === 0) {
          // Fallback : contacts synthétiques depuis allowedTargets si profiles vide ou RLS bloque
          const fallback = allowedTargets.map((t, i) => ({
            id:   `role-${t.role}-${i}`,
            nom:  t.label,
            role: t.role,
          }));
          setAllPersons(fallback);
          return;
        }
        const persons = data.map(p => ({
          id:   p.id as string,
          nom:  `${p.prenom} ${p.nom}`,
          role: p.role as string,
        }));
        persons.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
        setAllPersons(persons);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chargement des messages
  const fetchMessages = useCallback(async () => {
    if (!myId) return;
    const { data } = await sb.from("messages_internes").select("*")
      .or(`expediteur_id.eq.${myId},destinataire_id.eq.${myId},destinataire_role.eq.${myRole}`)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as MsgInterne[]);
  }, [sb, myId, myRole]);

  // Realtime filtré (tâche 5)
  useEffect(() => {
    if (!myId) return;
    fetchMessages();
    const ch = sb.channel(`msg-box-${myRole}-${myId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages_internes",
        filter: `destinataire_id=eq.${myId}`,
      }, fetchMessages)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages_internes",
        filter: `destinataire_role=eq.${myRole}`,
      }, fetchMessages)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchMessages, sb, myRole, myId]);

  // Sélectionner une conversation + marquer comme lu
  const selectPerson = useCallback(async (person: Person) => {
    setSelectedPerson(person);
    if (isMobile) setShowConvo(true);
    const unread = messages.filter(m =>
      !m.lu &&
      m.expediteur_id === person.id &&
      (m.destinataire_id === myId || (m.destinataire_role === myRole && !m.destinataire_id))
    );
    if (unread.length > 0) {
      await sb.from("messages_internes").update({ lu: true }).in("id", unread.map(m => m.id));
      fetchMessages();
    }
  }, [messages, myId, myRole, sb, fetchMessages, isMobile]);

  // Scroll vers le bas
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }, [messages, selectedPerson]);

  // Envoi — adapté fallback (tâche 4)
  async function send() {
    if (!text.trim() || !selectedPerson || !myId) return;
    setSending(true);
    const isFallback = selectedPerson.id.startsWith("role-");
    await sb.from("messages_internes").insert({
      expediteur_id:     myId,
      expediteur_nom:    myNom,
      expediteur_role:   myRole,
      destinataire_role: selectedPerson.role,
      destinataire_id:   isFallback ? null : selectedPerson.id,
      message:           text.trim(),
    });
    setText("");
    setSending(false);
    fetchMessages();
  }

  // Helpers conversation — adapté fallback (tâche 4)
  function getConvoMessages(person: Person): MsgInterne[] {
    const isFallback = person.id.startsWith("role-");
    if (isFallback) {
      return messages.filter(m =>
        (m.expediteur_id === myId && m.destinataire_role === person.role && !m.destinataire_id) ||
        (m.destinataire_role === myRole && m.expediteur_role === person.role && !m.destinataire_id)
      );
    }
    return messages.filter(m =>
      (m.expediteur_id === myId && m.destinataire_id === person.id) ||
      (m.expediteur_id === person.id && (
        m.destinataire_id === myId ||
        (m.destinataire_role === myRole && !m.destinataire_id)
      ))
    );
  }

  function getLastMsg(person: Person): MsgInterne | null {
    const msgs = getConvoMessages(person);
    return msgs[msgs.length - 1] ?? null;
  }

  function getUnread(person: Person): number {
    return messages.filter(m =>
      !m.lu &&
      m.expediteur_id === person.id &&
      (m.destinataire_id === myId || (m.destinataire_role === myRole && !m.destinataire_id))
    ).length;
  }

  function groupByDay(msgs: MsgInterne[]) {
    const groups: Record<string, MsgInterne[]> = {};
    msgs.forEach(m => {
      const d = m.created_at.slice(0, 10);
      if (!groups[d]) groups[d] = [];
      groups[d].push(m);
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

  function fmtShort(iso: string) {
    const d = new Date(iso);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d >= today) return d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
  }

  function initials(nom: string) {
    return nom.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  }

  // Tri : non lus en premier, puis par dernier message
  const sortedPersons = [...allPersons].sort((a, b) => {
    const au = getUnread(a), bu = getUnread(b);
    if (au > 0 && bu === 0) return -1;
    if (au === 0 && bu > 0) return 1;
    const al = getLastMsg(a)?.created_at ?? "";
    const bl = getLastMsg(b)?.created_at ?? "";
    return bl.localeCompare(al);
  });

  const filteredPersons = searchQuery.trim()
    ? sortedPersons.filter(p => p.nom.toLowerCase().includes(searchQuery.toLowerCase()))
    : sortedPersons;

  const convoMessages = selectedPerson ? getConvoMessages(selectedPerson) : [];

  const totalUnread = messages.filter(m =>
    !m.lu &&
    m.expediteur_id !== myId &&
    (m.destinataire_id === myId || (m.destinataire_role === myRole && !m.destinataire_id))
  ).length;

  // ── Rendu liste contacts ─────────────────────────────────────────────────────
  function renderContactList() {
    return (
      <div style={{
        display: "flex", flexDirection: "column", background: C.gray50,
        ...(isMobile
          ? { width: "100%", height: "100%" }
          : { width: 256, borderRight: `1px solid ${C.gray200}`, flexShrink: 0 }),
      }}>
        {/* Barre de recherche */}
        <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${C.gray200}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7,
            background: C.white, borderRadius: 10, border: `1px solid ${C.gray200}`,
            padding: "7px 12px" }}>
            <Search size={13} color={C.gray400} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher un contact…"
              style={{ border: "none", outline: "none", fontSize: 12, color: C.gray800,
                background: "transparent", flex: 1 }} />
          </div>
          {totalUnread > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 700 }}>
              {totalUnread} message{totalUnread > 1 ? "s" : ""} non lu{totalUnread > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Liste des contacts */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredPersons.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: C.gray400, fontSize: 12 }}>
              Aucun contact
            </div>
          ) : filteredPersons.map(person => {
            const lastMsg = getLastMsg(person);
            const unread  = getUnread(person);
            const isSel   = selectedPerson?.id === person.id;
            return (
              <div key={person.id} onClick={() => selectPerson(person)}
                style={{ padding: "11px 12px", cursor: "pointer",
                  display: "flex", gap: 10, alignItems: "center",
                  background: isSel ? C.skyL : "transparent",
                  borderBottom: `1px solid ${C.gray100}`,
                  borderLeft: `3px solid ${isSel ? C.navy : "transparent"}`,
                  transition: "background .1s" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%",
                  background: isSel ? C.navy : C.navyL,
                  color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 11, flexShrink: 0 }}>
                  {initials(person.nom)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                    <span style={{ fontWeight: unread > 0 ? 800 : 600, fontSize: 12,
                      color: C.gray800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {person.nom}
                    </span>
                    {lastMsg && (
                      <span style={{ fontSize: 10, color: C.gray400, flexShrink: 0 }}>
                        {fmtShort(lastMsg.created_at)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: unread > 0 ? C.gray600 : C.gray400,
                      fontWeight: unread > 0 ? 600 : 400,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {lastMsg
                        ? (lastMsg.expediteur_id === myId ? "Vous : " : "") +
                          lastMsg.message.slice(0, 30) + (lastMsg.message.length > 30 ? "…" : "")
                        : ROLE_LABELS[person.role] ?? person.role}
                    </span>
                    {unread > 0 && (
                      <span style={{ background: C.red, color: C.white, borderRadius: 99,
                        fontSize: 10, fontWeight: 900, padding: "1px 5px",
                        flexShrink: 0, marginLeft: 6 }}>
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Rendu conversation ───────────────────────────────────────────────────────
  function renderConversation() {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0,
        ...(isMobile ? { width: "100%", height: "100%" } : {}) }}>
        {selectedPerson ? (
          <>
            {/* En-tête */}
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray200}`,
              display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              {/* Bouton retour mobile */}
              {isMobile && (
                <button onClick={() => setShowConvo(false)}
                  style={{ background: "none", border: "none", cursor: "pointer",
                    color: C.navyL, padding: "4px 8px 4px 0", display: "flex", alignItems: "center" }}>
                  <ArrowLeft size={20} />
                </button>
              )}
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.navy,
                color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 11 }}>
                {initials(selectedPerson.nom)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.gray800 }}>{selectedPerson.nom}</div>
                <div style={{ fontSize: 11, color: C.gray400 }}>
                  {ROLE_LABELS[selectedPerson.role] ?? selectedPerson.role}
                </div>
              </div>
            </div>

            {/* Fil de messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px",
              display: "flex", flexDirection: "column", gap: 2 }}>
              {convoMessages.length === 0 ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", color: C.gray400, textAlign: "center" }}>
                  <MessageSquare size={28} strokeWidth={1.5} style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 13, fontWeight: 600 }}>Démarrez la conversation</p>
                </div>
              ) : groupByDay(convoMessages).map(([day, msgs]) => (
                <div key={day}>
                  <div style={{ textAlign: "center", margin: "10px 0 8px" }}>
                    <span style={{ fontSize: 10, color: C.gray400, fontWeight: 700,
                      background: C.gray100, borderRadius: 99, padding: "2px 10px" }}>
                      {fmtDay(day)}
                    </span>
                  </div>
                  {msgs.map(m => {
                    const isMine = m.expediteur_id === myId;
                    return (
                      <div key={m.id} style={{ display: "flex",
                        justifyContent: isMine ? "flex-end" : "flex-start",
                        marginBottom: 5 }}>
                        <div style={{ maxWidth: "72%",
                          background: isMine ? C.navy : C.gray100,
                          color: isMine ? C.white : C.gray800,
                          borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                          padding: "9px 13px",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{m.message}</div>
                          <div style={{ fontSize: 10, marginTop: 3, textAlign: "right",
                            color: isMine ? "rgba(255,255,255,0.5)" : C.gray400 }}>
                            {new Date(m.created_at).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
                            {isMine && <span style={{ marginLeft: 4 }}>{m.lu ? "✓✓" : "✓"}</span>}
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
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.gray200}`,
              display: "flex", gap: 8, flexShrink: 0 }}>
              <input value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Message à ${selectedPerson.nom}…`}
                style={{ flex: 1, padding: "9px 14px", borderRadius: 10,
                  border: `1.5px solid ${C.gray200}`, fontSize: 13,
                  background: C.white, outline: "none", color: C.gray800 }} />
              <button onClick={send} disabled={sending || !text.trim()}
                style={{ padding: "9px 14px", borderRadius: 10, border: "none",
                  background: text.trim() ? C.navy : C.gray200,
                  color: text.trim() ? C.white : C.gray400,
                  cursor: text.trim() ? "pointer" : "default",
                  display: "flex", alignItems: "center", transition: "background 0.15s" }}>
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", color: C.gray400 }}>
            <MessageSquare size={36} strokeWidth={1} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>Sélectionnez une conversation</p>
            <p style={{ fontSize: 12, marginTop: 6, color: C.gray400 }}>
              {allPersons.length} contact{allPersons.length > 1 ? "s" : ""} disponible{allPersons.length > 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Layout mobile vs desktop ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ border: `1px solid ${C.gray200}`, borderRadius: 16,
        overflow: "hidden", background: C.white,
        minHeight: 480, display: "flex", flexDirection: "column" }}>
        {showConvo && selectedPerson
          ? renderConversation()
          : renderContactList()
        }
      </div>
    );
  }

  // Desktop : 2 colonnes côte à côte
  return (
    <div style={{ display: "flex", border: `1px solid ${C.gray200}`, borderRadius: 16,
      overflow: "hidden", height: 520, background: C.white }}>
      {renderContactList()}
      {renderConversation()}
    </div>
  );
}
