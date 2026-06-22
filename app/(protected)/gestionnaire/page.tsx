"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, statusColor, statusLabel, todayStr } from "@/lib/constants";
import { Badge, Avatar, Card, InfoBox, Btn, Modal, Stat } from "@/components/ui";
import type {
  Conducteur, Circuit, Vehicule, AbsenceEnfant, Enfant,
  Incident, Alerte, Reparation, AbsenceConducteur, ServiceLog,
} from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────
type SB = ReturnType<typeof createClient>;
type TabId = "dashboard"|"rapport"|"imprevus"|"conducteurs"|"vehicules"|"circuits"|"incidents"|"alertes"|"exports";
type Period = "today"|"yesterday"|"week"|"month";

const TABS: {id:TabId;icon:string;label:string}[] = [
  {id:"dashboard",   icon:"🏠", label:"Tableau de bord"},
  {id:"rapport",     icon:"📋", label:"Rapport journalier"},
  {id:"imprevus",    icon:"⚡", label:"Imprévus"},
  {id:"conducteurs", icon:"👥", label:"Conducteurs"},
  {id:"vehicules",   icon:"🚌", label:"Véhicules"},
  {id:"circuits",    icon:"🛣️", label:"Circuits"},
  {id:"incidents",   icon:"🚨", label:"Incidents"},
  {id:"alertes",     icon:"🔔", label:"Alertes"},
  {id:"exports",     icon:"📊", label:"Exports"},
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoAgo   = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const fmtDate  = (d: string) => new Date(d).toLocaleDateString("fr-CH", {day:"2-digit",month:"2-digit",year:"numeric"});
const fmtTime  = (d: string) => new Date(d).toLocaleTimeString("fr-CH", {hour:"2-digit",minute:"2-digit"});
const fmtDT    = (d: string) => new Date(d).toLocaleString("fr-CH", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const bom = "ï»¿";
  const csv = bom + [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = filename;
  a.click();
}

const inputSt: React.CSSProperties = {
  width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${C.gray200}`,
  fontSize:13, color:C.gray800, fontFamily:"inherit", boxSizing:"border-box",
};
const labelSt: React.CSSProperties = {
  fontSize:11, fontWeight:700, color:C.gray600,
  textTransform:"uppercase", letterSpacing:0.5, marginBottom:4, display:"block",
};

// ── AssignModal ───────────────────────────────────────────────────────────────
function AssignModal({ driver, drivers, circuits, onClose, onAssign }: {
  driver: Conducteur; drivers: Conducteur[]; circuits: Circuit[];
  onClose: () => void;
  onAssign: (absentId: number, replacerId: number, circuitId: string) => Promise<void>;
}) {
  const [step, setStep] = useState<"info"|"pick"|"done">("info");
  const [sel, setSel]   = useState<number|null>(null);
  const [busy, setBusy] = useState(false);
  const circ  = circuits.find(c => c.id === driver.circuit_id);
  const avail = drivers.filter(d => d.id !== driver.id && ["disponible","en_attente"].includes(d.status));

  const doAssign = async () => {
    if (!sel || !circ) return;
    setBusy(true);
    await onAssign(driver.id, sel, circ.id);
    setBusy(false);
    setStep("done");
  };

  return (
    <Modal title={`Absence : ${driver.prenom} ${driver.nom}`} onClose={onClose}>
      {step === "info" && <>
        <div style={{background:C.redL,borderRadius:12,padding:16,marginBottom:16,border:`1px solid #FCA5A5`}}>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <Avatar initials={driver.photo_initials} size={44} color={C.red}/>
            <div>
              <div style={{fontWeight:800,fontSize:15,color:C.red}}>{driver.prenom} {driver.nom}</div>
              <div style={{fontSize:12,color:C.gray600,marginTop:2}}>{driver.absence_motif || "Motif non renseigné"}</div>
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
          <InfoBox label="Circuit à couvrir" value={circ ? `${circ.emoji} ${circ.nom} (${circ.num})` : "—"} highlight={C.red}/>
          <InfoBox label="Véhicule habituel" value={driver.vehicule?.plaque || "—"}/>
          <InfoBox label="École" value={circ?.cercle?.nom || "—"}/>
          <InfoBox label="Enfants" value={circ ? `${circ.enfants_count} enfants` : "—"}/>
        </div>
        {circ
          ? <div style={{background:C.amberL,borderRadius:8,padding:12,marginBottom:16,fontSize:13,border:`1px solid #FDE68A`}}>
              ⚠ Circuit <strong>{circ.nom}</strong> non couvert. Assignez un remplaçant.
            </div>
          : <div style={{background:C.gray100,borderRadius:8,padding:12,marginBottom:16,fontSize:13}}>
              Ce conducteur n'a pas de circuit assigné.
            </div>
        }
        <Btn full onClick={() => setStep("pick")} color={C.navyL}>Trouver un remplaçant →</Btn>
      </>}

      {step === "pick" && <>
        <button onClick={() => setStep("info")}
          style={{background:"none",border:"none",color:C.navyL,cursor:"pointer",fontWeight:700,fontSize:13,padding:0,marginBottom:14}}>
          ← Retour
        </button>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>Conducteurs disponibles</div>
        <div style={{fontSize:12,color:C.gray400,marginBottom:12}}>
          Pour couvrir {circ?.emoji} {circ?.nom}
        </div>
        {avail.length === 0
          ? <div style={{textAlign:"center",padding:20,color:C.gray400,fontSize:13}}>Aucun conducteur disponible.</div>
          : avail.map(d => (
            <div key={d.id} onClick={() => setSel(d.id)}
              style={{display:"flex",gap:12,alignItems:"center",padding:12,borderRadius:10,marginBottom:8,
                border:`2px solid ${sel === d.id ? C.navyL : C.gray200}`,
                background:sel === d.id ? C.skyL : C.white, cursor:"pointer"}}>
              <Avatar initials={d.photo_initials}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:C.gray800}}>{d.prenom} {d.nom}</div>
                <div style={{fontSize:12,color:C.gray400,marginTop:1}}>Permis {d.permis||"—"} · {d.tel||"—"}</div>
              </div>
              <Badge color={statusColor(d.status) as "green"|"red"|"amber"|"blue"|"gray"}>
                {statusLabel(d.status)}
              </Badge>
            </div>
          ))
        }
        <div style={{marginTop:12}}>
          <Btn full onClick={doAssign} disabled={!sel || !circ || busy} color={C.green}>
            {busy ? "Attribution..." : "✅ Attribuer le circuit"}
          </Btn>
        </div>
      </>}

      {step === "done" && (
        <div style={{textAlign:"center",padding:"32px 0"}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{fontSize:18,fontWeight:800,color:C.green}}>Circuit attribué !</div>
          <div style={{fontSize:13,color:C.gray600,marginTop:8}}>Le conducteur remplaçant a été notifié.</div>
          <div style={{marginTop:20}}><Btn onClick={onClose} outline color={C.navyL}>Fermer</Btn></div>
        </div>
      )}
    </Modal>
  );
}

// ── ChildAbsModal ─────────────────────────────────────────────────────────────
function ChildAbsModal({ absence, enfants, drivers, circuits, onClose, onTransmit }: {
  absence: AbsenceEnfant; enfants: Enfant[]; drivers: Conducteur[]; circuits: Circuit[];
  onClose: () => void;
  onTransmit: (id: number) => Promise<void>;
}) {
  const child = absence.enfant || enfants.find(e => e.id === absence.enfant_id);
  const circ  = circuits.find(c => c.id === absence.circuit_id);
  const drv   = drivers.find(d => d.circuit_id === absence.circuit_id);
  const [done, setDone] = useState(absence.transmitted_to_driver);
  const [busy, setBusy] = useState(false);

  const doTransmit = async () => {
    setBusy(true);
    await onTransmit(absence.id);
    setDone(true);
    setBusy(false);
  };

  return (
    <Modal title="Absence enfant" onClose={onClose}>
      <div style={{background:C.amberL,borderRadius:12,padding:16,marginBottom:16,border:`1px solid #FDE68A`}}>
        <div style={{fontSize:15,fontWeight:800,color:C.amber,marginBottom:4}}>
          ⚠ {child?.prenom} {child?.nom}
        </div>
        <div style={{fontSize:13,color:C.gray800}}>
          Motif : <strong>{absence.reason}</strong>
        </div>
        <div style={{fontSize:12,color:C.gray600,marginTop:4}}>
          Signalé par {absence.reported_by} à {fmtTime(absence.reported_at)}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
        <InfoBox label="Circuit" value={circ ? `${circ.emoji} ${circ.nom}` : "—"}/>
        <InfoBox label="École" value={circ?.cercle?.nom || "—"}/>
        <InfoBox label="Conducteur" value={drv ? `${drv.prenom} ${drv.nom}` : "—"}/>
        <InfoBox label="Parent" value={child?.parent_nom || "—"}/>
        <InfoBox label="Tél. parent" value={child?.parent_tel || "—"}/>
        <InfoBox label="Date absence" value={fmtDate(absence.date_absence)}/>
        {child?.adresse_mere && <InfoBox label="Adresse mère" value={child.adresse_mere} full/>}
        {child?.adresse_pere && <InfoBox label="Adresse père" value={child.adresse_pere} full/>}
      </div>
      {!done
        ? <Btn full onClick={doTransmit} color={C.navyL} disabled={busy}>
            {busy ? "Envoi..." : `📨 Transmettre au conducteur${drv ? ` (${drv.prenom} ${drv.nom})` : ""}`}
          </Btn>
        : <div style={{textAlign:"center",padding:12,background:C.greenL,borderRadius:8,color:C.green,fontWeight:700,fontSize:13}}>
            ✅ Transmis au conducteur
          </div>
      }
    </Modal>
  );
}

// ── DriverDetailModal ─────────────────────────────────────────────────────────
function DriverDetailModal({ driver, circuits, vehicles, incidents, sb, onClose, onRefresh }: {
  driver: Conducteur|null; circuits: Circuit[]; vehicles: Vehicule[]; incidents: Incident[];
  sb: SB; onClose: () => void; onRefresh: () => void;
}) {
  const isNew = !driver;
  const [edit, setEdit] = useState(isNew);
  const [form, setForm] = useState({
    nom: driver?.nom||"", prenom: driver?.prenom||"", tel: driver?.tel||"",
    permis: driver?.permis||"", permis_exp: driver?.permis_exp||"",
    circuit_id: driver?.circuit_id||"", vehicule_id: driver?.vehicule_id||"",
    status: driver?.status||"disponible", absence_motif: driver?.absence_motif||"",
    notes: driver?.notes||"", affectation: driver?.affectation||"Scolaire",
    tachygraphe: driver?.tachygraphe||false, photo_initials: driver?.photo_initials||"",
  });
  const [busy,    setBusy]    = useState(false);
  const [delConf, setDelConf] = useState(false);

  const drvInc  = driver ? incidents.filter(i => i.conducteur_id === driver.id) : [];
  const drvCirc = circuits.find(c => c.id === form.circuit_id);
  const drvVeh  = vehicles.find(v => v.id === form.vehicule_id);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) =>
    setForm(p => ({...p, [k]: (e.target as HTMLInputElement).type==="checkbox" ? (e.target as HTMLInputElement).checked : e.target.value}));

  const handleSave = async () => {
    setBusy(true);
    if (isNew) {
      await sb.from("conducteurs").insert({...form, circuit_id:form.circuit_id||null, vehicule_id:form.vehicule_id||null});
    } else {
      await sb.from("conducteurs").update({...form, circuit_id:form.circuit_id||null, vehicule_id:form.vehicule_id||null})
        .eq("id", driver!.id);
    }
    setBusy(false);
    onRefresh();
    if (!isNew) setEdit(false);
    else onClose();
  };

  const handleDelete = async () => {
    setBusy(true);
    await sb.from("conducteurs").delete().eq("id", driver!.id);
    setBusy(false);
    onRefresh();
    onClose();
  };

  return (
    <Modal title={isNew ? "Nouveau conducteur" : `${driver!.prenom} ${driver!.nom}`} onClose={onClose} wide>
      {!edit && driver && (
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <Btn small onClick={() => setEdit(true)} color={C.navyL}>✏️ Modifier</Btn>
          <Btn small onClick={() => window.print()} outline color={C.gray600}>📄 Fiche PDF</Btn>
          <Btn small onClick={() => setDelConf(true)} outline color={C.red}>🗑️ Supprimer</Btn>
        </div>
      )}
      {delConf && (
        <div style={{background:C.redL,borderRadius:10,padding:14,marginBottom:16,border:`1px solid #FCA5A5`}}>
          <div style={{fontWeight:700,color:C.red,marginBottom:8}}>⚠ Supprimer {driver?.prenom} {driver?.nom} ?</div>
          <div style={{display:"flex",gap:8}}>
            <Btn small onClick={handleDelete} color={C.red} disabled={busy}>Confirmer</Btn>
            <Btn small onClick={() => setDelConf(false)} outline color={C.gray600}>Annuler</Btn>
          </div>
        </div>
      )}

      {edit ? (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={labelSt}>Prénom</label><input style={inputSt} value={form.prenom} onChange={f("prenom")}/></div>
          <div><label style={labelSt}>Nom</label><input style={inputSt} value={form.nom} onChange={f("nom")}/></div>
          <div><label style={labelSt}>Téléphone</label><input style={inputSt} value={form.tel} onChange={f("tel")}/></div>
          <div><label style={labelSt}>Initiales</label><input style={inputSt} value={form.photo_initials} onChange={f("photo_initials")} maxLength={3}/></div>
          <div><label style={labelSt}>Permis (catégories)</label><input style={inputSt} value={form.permis} onChange={f("permis")} placeholder="B, D, D1"/></div>
          <div><label style={labelSt}>Expiration permis</label><input type="date" style={inputSt} value={form.permis_exp} onChange={f("permis_exp")}/></div>
          <div><label style={labelSt}>Circuit</label>
            <select style={inputSt} value={form.circuit_id} onChange={f("circuit_id")}>
              <option value="">— Aucun —</option>
              {circuits.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.nom} ({c.num})</option>)}
            </select>
          </div>
          <div><label style={labelSt}>Véhicule</label>
            <select style={inputSt} value={form.vehicule_id} onChange={f("vehicule_id")}>
              <option value="">— Aucun —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.plaque} ({v.marque})</option>)}
            </select>
          </div>
          <div><label style={labelSt}>Statut</label>
            <select style={inputSt} value={form.status} onChange={f("status")}>
              <option value="disponible">Disponible</option>
              <option value="en_service">En service</option>
              <option value="en_attente">En attente</option>
              <option value="absent">Absent</option>
              <option value="termine">Terminé</option>
            </select>
          </div>
          <div><label style={labelSt}>Motif absence</label><input style={inputSt} value={form.absence_motif} onChange={f("absence_motif")}/></div>
          <div style={{gridColumn:"1/-1"}}><label style={labelSt}>Affectation</label><input style={inputSt} value={form.affectation} onChange={f("affectation")}/></div>
          <div style={{gridColumn:"1/-1"}}><label style={labelSt}>Notes</label>
            <textarea style={{...inputSt,minHeight:60,resize:"vertical"}} value={form.notes} onChange={f("notes")}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input type="checkbox" id="tach_chk" checked={form.tachygraphe}
              onChange={e => setForm(p => ({...p,tachygraphe:e.target.checked}))}/>
            <label htmlFor="tach_chk" style={{fontSize:13,fontWeight:600}}>Formation tachygraphe</label>
          </div>
          <div style={{gridColumn:"1/-1",display:"flex",gap:8,marginTop:4}}>
            <Btn onClick={handleSave} color={C.green} disabled={busy}>{busy?"Sauvegarde...":"💾 Enregistrer"}</Btn>
            {!isNew && <Btn onClick={() => setEdit(false)} outline color={C.gray600}>Annuler</Btn>}
          </div>
        </div>
      ) : (
        <div>
          <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:16}}>
            <Avatar initials={driver!.photo_initials} size={56}/>
            <div>
              <div style={{fontSize:20,fontWeight:900,color:C.gray800}}>{driver!.prenom} {driver!.nom}</div>
              <div style={{marginTop:4,display:"flex",gap:6,flexWrap:"wrap"}}>
                <Badge color={statusColor(driver!.status) as "green"|"red"|"amber"|"blue"|"gray"}>{statusLabel(driver!.status)}</Badge>
                {driver!.tachygraphe && <Badge color="navy">📋 Tachygraphe</Badge>}
              </div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            <InfoBox label="Téléphone"    value={driver!.tel||"—"}/>
            <InfoBox label="Permis"       value={driver!.permis||"—"}/>
            <InfoBox label="Exp. permis"  value={driver!.permis_exp?fmtDate(driver!.permis_exp):"—"}/>
            <InfoBox label="Affectation"  value={driver!.affectation}/>
            <InfoBox label="Circuit"      value={drvCirc ? `${drvCirc.emoji} ${drvCirc.nom}` : "—"}/>
            <InfoBox label="Véhicule"     value={drvVeh?.plaque || "—"}/>
            {driver!.absence_motif && <InfoBox label="Motif absence" value={driver!.absence_motif} highlight={C.red} full/>}
            {driver!.notes && <InfoBox label="Notes" value={driver!.notes} full/>}
          </div>
          {drvInc.length > 0 && (
            <div>
              <div style={{fontWeight:700,fontSize:11,color:C.gray600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                Incidents récents ({drvInc.length})
              </div>
              {drvInc.slice(0,4).map(i => (
                <div key={i.id} style={{background:C.gray50,borderRadius:8,padding:"7px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:12}}>
                    <span style={{fontWeight:700}}>{fmtDate(i.reported_at)}</span> · {i.type} · {i.description.slice(0,60)}
                  </div>
                  <Badge color={i.status==="resolu"?"green":i.status==="en_cours"?"blue":"amber"}>
                    {i.status==="resolu"?"Résolu":i.status==="en_cours"?"En cours":"Att."}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── VehicleDetailModal ────────────────────────────────────────────────────────
function VehicleDetailModal({ vehicle, drivers, circuits, reparations, sb, onClose, onRefresh }: {
  vehicle: Vehicule|null; drivers: Conducteur[]; circuits: Circuit[]; reparations: Reparation[];
  sb: SB; onClose: () => void; onRefresh: () => void;
}) {
  const isNew = !vehicle;
  const [edit, setEdit] = useState(isNew);
  const [form, setForm] = useState({
    id: vehicle?.id||"", plaque: vehicle?.plaque||"", marque: vehicle?.marque||"",
    modele: vehicle?.modele||"", places: vehicle?.places||0, places_handi: vehicle?.places_handi||0,
    etat: vehicle?.etat||"bon", circuit_id: vehicle?.circuit_id||"",
    ct_date: vehicle?.ct_date||"", assurance_date: vehicle?.assurance_date||"", km: vehicle?.km||0,
  });
  const [busy,    setBusy]    = useState(false);
  const [delConf, setDelConf] = useState(false);
  const [copied,  setCopied]  = useState(false);

  const vehRep     = vehicle ? reparations.filter(r => r.vehicule_id === vehicle.id) : [];
  const habDriver  = drivers.find(d => d.vehicule_id === vehicle?.id || d.circuit_id === form.circuit_id);
  const vehCirc    = circuits.find(c => c.id === form.circuit_id);
  const scanUrl    = vehicle ? `${typeof window!=="undefined"?window.location.origin:""}/scan/${vehicle.id}` : "";
  const etatLabel: Record<string,string> = {bon:"En service",attention:"À surveiller",atelier:"En atelier"};

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) =>
    setForm(p => ({...p, [k]: e.target.type==="number" ? Number(e.target.value) : e.target.value}));

  const handleSave = async () => {
    setBusy(true);
    const payload = {...form, circuit_id: form.circuit_id||null};
    if (isNew) {
      await sb.from("vehicules").insert(payload);
    } else {
      await sb.from("vehicules").update(payload).eq("id", vehicle!.id);
    }
    setBusy(false);
    onRefresh();
    if (!isNew) setEdit(false);
    else onClose();
  };

  const handleDelete = async () => {
    setBusy(true);
    await sb.from("vehicules").delete().eq("id", vehicle!.id);
    setBusy(false);
    onRefresh();
    onClose();
  };

  const doCopy = () => {
    navigator.clipboard?.writeText(scanUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal title={isNew ? "Nouveau véhicule" : vehicle!.plaque} onClose={onClose} wide>
      {!edit && vehicle && (
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <Btn small onClick={() => setEdit(true)} color={C.navyL}>✏️ Modifier</Btn>
          <Btn small onClick={() => window.print()} outline color={C.gray600}>🖨️ Imprimer QR</Btn>
          <Btn small onClick={() => setDelConf(true)} outline color={C.red}>🗑️ Supprimer</Btn>
        </div>
      )}
      {delConf && (
        <div style={{background:C.redL,borderRadius:10,padding:14,marginBottom:16,border:`1px solid #FCA5A5`}}>
          <div style={{fontWeight:700,color:C.red,marginBottom:8}}>⚠ Supprimer {vehicle?.plaque} ?</div>
          <div style={{display:"flex",gap:8}}>
            <Btn small onClick={handleDelete} color={C.red} disabled={busy}>Confirmer</Btn>
            <Btn small onClick={() => setDelConf(false)} outline color={C.gray600}>Annuler</Btn>
          </div>
        </div>
      )}

      {edit ? (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {isNew && <div><label style={labelSt}>ID véhicule</label><input style={inputSt} value={form.id} onChange={f("id")} placeholder="FR-123456"/></div>}
          <div><label style={labelSt}>Plaque</label><input style={inputSt} value={form.plaque} onChange={f("plaque")}/></div>
          <div><label style={labelSt}>Marque</label><input style={inputSt} value={form.marque} onChange={f("marque")}/></div>
          <div><label style={labelSt}>Modèle</label><input style={inputSt} value={form.modele} onChange={f("modele")}/></div>
          <div><label style={labelSt}>Places</label><input type="number" style={inputSt} value={form.places} onChange={f("places")}/></div>
          <div><label style={labelSt}>Places handi</label><input type="number" style={inputSt} value={form.places_handi} onChange={f("places_handi")}/></div>
          <div><label style={labelSt}>État</label>
            <select style={inputSt} value={form.etat} onChange={f("etat")}>
              <option value="bon">En service (bon)</option>
              <option value="attention">À surveiller</option>
              <option value="atelier">En atelier</option>
            </select>
          </div>
          <div><label style={labelSt}>Circuit affecté</label>
            <select style={inputSt} value={form.circuit_id} onChange={f("circuit_id")}>
              <option value="">— Aucun —</option>
              {circuits.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.nom}</option>)}
            </select>
          </div>
          <div><label style={labelSt}>CT (MM.AAAA)</label><input style={inputSt} value={form.ct_date} onChange={f("ct_date")} placeholder="04.2027"/></div>
          <div><label style={labelSt}>Assurance (MM.AAAA)</label><input style={inputSt} value={form.assurance_date} onChange={f("assurance_date")} placeholder="04.2027"/></div>
          <div><label style={labelSt}>Kilométrage</label><input type="number" style={inputSt} value={form.km} onChange={f("km")}/></div>
          <div style={{gridColumn:"1/-1",display:"flex",gap:8,marginTop:4}}>
            <Btn onClick={handleSave} color={C.green} disabled={busy}>{busy?"Sauvegarde...":"💾 Enregistrer"}</Btn>
            {!isNew && <Btn onClick={() => setEdit(false)} outline color={C.gray600}>Annuler</Btn>}
          </div>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:20}}>
          <div>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:40}}>🚌</div>
              <div>
                <div style={{fontWeight:900,fontSize:18,color:C.gray800}}>{vehicle!.plaque}</div>
                <div style={{fontSize:14,color:C.gray600}}>{vehicle!.marque} {vehicle!.modele}</div>
                <div style={{marginTop:4}}>
                  <Badge color={(vehicle!.etat as string)==="bon"?"green":(vehicle!.etat as string)==="attention"?"amber":"red"}>
                    {etatLabel[vehicle!.etat as string]||vehicle!.etat}
                  </Badge>
                </div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              <InfoBox label="Places" value={`${vehicle!.places} + ${vehicle!.places_handi} handi`}/>
              <InfoBox label="Kilométrage" value={`${vehicle!.km?.toLocaleString("fr-CH")} km`}/>
              <InfoBox label="CT" value={vehicle!.ct_date||"—"}/>
              <InfoBox label="Assurance" value={vehicle!.assurance_date||"—"}/>
              <InfoBox label="Circuit" value={vehCirc ? `${vehCirc.emoji} ${vehCirc.nom}` : "—"}/>
              <InfoBox label="Conducteur habituel" value={habDriver ? `${habDriver.prenom} ${habDriver.nom}` : "—"}/>
            </div>
            {vehRep.length > 0 && (
              <div>
                <div style={{fontWeight:700,fontSize:11,color:C.gray600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                  Réparations ({vehRep.length})
                </div>
                {vehRep.slice(0,4).map(r => (
                  <div key={r.id} style={{background:C.gray50,borderRadius:8,padding:"7px 12px",marginBottom:5,fontSize:12}}>
                    <span style={{fontWeight:700}}>{r.date_reparation?fmtDate(r.date_reparation):fmtDate(r.created_at)}</span>
                    {" · "}{r.description.slice(0,60)}
                    {r.cout ? <span style={{color:C.amber,fontWeight:700}}> · {r.cout} CHF</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{background:C.gray50,borderRadius:12,padding:16,textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.gray600,marginBottom:12}}>QR Code véhicule</div>
            <div style={{background:C.white,borderRadius:8,padding:16,marginBottom:12,border:`1px solid ${C.gray200}`}}>
              <div style={{fontSize:40,marginBottom:6}}>📱</div>
              <div style={{fontSize:10,color:C.gray600,wordBreak:"break-all",marginBottom:4}}>{scanUrl}</div>
              <div style={{fontSize:10,color:C.gray400,fontFamily:"monospace"}}>{vehicle!.qr_token?.slice(0,12)}…</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <Btn small onClick={doCopy} color={C.navyL}>{copied?"✅ Copié !":"📋 Copier l'URL"}</Btn>
              <Btn small onClick={() => window.open(scanUrl,"_blank")} outline color={C.gray600}>🔗 Ouvrir la page</Btn>
              <Btn small onClick={() => window.print()} outline color={C.gray600}>🖨️ Imprimer</Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── CircuitDetailModal ────────────────────────────────────────────────────────
function CircuitDetailModal({ circuit, drivers, enfants, sb, onClose, onRefresh }: {
  circuit: Circuit|null; drivers: Conducteur[]; enfants: Enfant[];
  sb: SB; onClose: () => void; onRefresh: () => void;
}) {
  const isNew = !circuit;
  const [edit, setEdit] = useState(isNew);
  const [form, setForm] = useState({
    id: circuit?.id||"", nom: circuit?.nom||"", emoji: circuit?.emoji||"",
    num: circuit?.num||"", enfants_count: circuit?.enfants_count||0, km_aller: circuit?.km_aller||0,
  });
  const [busy,    setBusy]    = useState(false);
  const [delConf, setDelConf] = useState(false);

  const circDrivers = drivers.filter(d => d.circuit_id === circuit?.id);
  const circEnfants = enfants.filter(e => e.circuit_id === circuit?.id);

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({...p, [k]: e.target.type==="number" ? Number(e.target.value) : e.target.value}));

  const handleSave = async () => {
    setBusy(true);
    if (isNew) {
      await sb.from("circuits").insert(form);
    } else {
      await sb.from("circuits").update({nom:form.nom,emoji:form.emoji,num:form.num,
        enfants_count:form.enfants_count,km_aller:form.km_aller}).eq("id", circuit!.id);
    }
    setBusy(false);
    onRefresh();
    if (!isNew) setEdit(false);
    else onClose();
  };

  const handleDelete = async () => {
    setBusy(true);
    await sb.from("circuits").delete().eq("id", circuit!.id);
    setBusy(false);
    onRefresh();
    onClose();
  };

  return (
    <Modal title={isNew ? "Nouveau circuit" : `${circuit!.emoji} ${circuit!.nom}`} onClose={onClose} wide>
      {!edit && circuit && (
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <Btn small onClick={() => setEdit(true)} color={C.navyL}>✏️ Modifier</Btn>
          <Btn small onClick={() => setDelConf(true)} outline color={C.red}>🗑️ Supprimer</Btn>
        </div>
      )}
      {delConf && (
        <div style={{background:C.redL,borderRadius:10,padding:14,marginBottom:16,border:`1px solid #FCA5A5`}}>
          <div style={{fontWeight:700,color:C.red,marginBottom:8}}>⚠ Supprimer le circuit {circuit?.nom} ?</div>
          <div style={{display:"flex",gap:8}}>
            <Btn small onClick={handleDelete} color={C.red} disabled={busy}>Confirmer</Btn>
            <Btn small onClick={() => setDelConf(false)} outline color={C.gray600}>Annuler</Btn>
          </div>
        </div>
      )}
      {edit ? (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {isNew && <div><label style={labelSt}>ID (ex: C055)</label><input style={inputSt} value={form.id} onChange={f("id")}/></div>}
          <div><label style={labelSt}>Nom</label><input style={inputSt} value={form.nom} onChange={f("nom")}/></div>
          <div><label style={labelSt}>Emoji</label><input style={inputSt} value={form.emoji} onChange={f("emoji")} maxLength={4}/></div>
          <div><label style={labelSt}>Numéro</label><input style={inputSt} value={form.num} onChange={f("num")} placeholder="01"/></div>
          <div><label style={labelSt}>Nb enfants</label><input type="number" style={inputSt} value={form.enfants_count} onChange={f("enfants_count")}/></div>
          <div><label style={labelSt}>Distance aller (km)</label><input type="number" style={inputSt} value={form.km_aller} onChange={f("km_aller")}/></div>
          <div style={{gridColumn:"1/-1",display:"flex",gap:8,marginTop:4}}>
            <Btn onClick={handleSave} color={C.green} disabled={busy}>{busy?"Sauvegarde...":"💾 Enregistrer"}</Btn>
            {!isNew && <Btn onClick={() => setEdit(false)} outline color={C.gray600}>Annuler</Btn>}
          </div>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div>
            <div style={{fontSize:48,marginBottom:8}}>{circuit!.emoji}</div>
            <div style={{fontWeight:900,fontSize:20,color:C.gray800,marginBottom:4}}>{circuit!.nom}</div>
            <div style={{fontSize:13,color:C.gray600,marginBottom:16}}>
              Circuit N°{circuit!.num} · {circuit!.cercle?.nom||"—"}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              <InfoBox label="Enfants inscrits" value={circuit!.enfants_count}/>
              <InfoBox label="Distance aller" value={circuit!.km_aller ? `${circuit!.km_aller} km` : "—"}/>
            </div>
            <div style={{fontWeight:700,fontSize:11,color:C.gray600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
              Conducteur(s)
            </div>
            {circDrivers.length === 0
              ? <div style={{color:C.red,fontSize:13,fontWeight:700}}>⚠ Aucun conducteur assigné</div>
              : circDrivers.map(d => (
                <div key={d.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.gray100}`}}>
                  <Avatar initials={d.photo_initials} size={32}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13}}>{d.prenom} {d.nom}</div>
                    <div style={{fontSize:11,color:C.gray400}}>{d.tel||"—"}</div>
                  </div>
                  <Badge color={statusColor(d.status) as "green"|"red"|"amber"|"blue"|"gray"}>{statusLabel(d.status)}</Badge>
                </div>
              ))
            }
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:11,color:C.gray600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
              Enfants inscrits ({circEnfants.length})
            </div>
            <div style={{maxHeight:280,overflowY:"auto"}}>
              {circEnfants.map(e => (
                <div key={e.id} style={{padding:"7px 0",borderBottom:`1px solid ${C.gray100}`,fontSize:13}}>
                  <div style={{fontWeight:700}}>{e.prenom} {e.nom}</div>
                  {e.parent_nom && <div style={{fontSize:11,color:C.gray600}}>{e.parent_nom}</div>}
                </div>
              ))}
              {circEnfants.length === 0 && <div style={{color:C.gray400,fontSize:13}}>Aucun enfant inscrit</div>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── ImprevuModal ──────────────────────────────────────────────────────────────
function ImprevuModal({ drivers, sb, onClose, onRefresh }: {
  drivers: Conducteur[]; sb: SB; onClose: () => void; onRefresh: () => void;
}) {
  const [type,    setType]    = useState("autre");
  const [msg,     setMsg]     = useState("");
  const [search,  setSearch]  = useState("");
  const [selDrv,  setSelDrv]  = useState<number|null>(null);
  const [target,  setTarget]  = useState<"conducteur"|"all"|"mecanicien"|"admin">("all");
  const [busy,    setBusy]    = useState(false);

  const TYPES = [{v:"absence",l:"Absence"},{v:"ecole",l:"École"},{v:"parent",l:"Parent"},
    {v:"vehicule",l:"Véhicule"},{v:"meteo",l:"Météo"},{v:"autre",l:"Autre"}];

  const filtered = drivers.filter(d =>
    search.trim() === "" || `${d.prenom} ${d.nom}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleSend = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    const payload: Record<string,unknown> = {
      type: "imprévu", severity: "haute",
      message: `[${type.toUpperCase()}] ${msg}`, read: false,
    };
    if (target === "conducteur" && selDrv) payload.driver_id = selDrv;
    await sb.from("alertes").insert(payload);
    setBusy(false);
    onRefresh();
    onClose();
  };

  return (
    <Modal title="Créer un imprévu" onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div>
          <div style={{fontWeight:700,fontSize:11,color:C.gray600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
            Type d'imprévu
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:14}}>
            {TYPES.map(t => (
              <button key={t.v} onClick={() => setType(t.v)}
                style={{padding:"8px 10px",borderRadius:8,border:`2px solid ${type===t.v?C.navyL:C.gray200}`,
                  background:type===t.v?C.skyL:C.white,fontWeight:700,fontSize:12,
                  color:type===t.v?C.navy:C.gray600,cursor:"pointer"}}>
                {t.l}
              </button>
            ))}
          </div>
          <div style={{fontWeight:700,fontSize:11,color:C.gray600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>
            Message
          </div>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5}
            style={{...inputSt,resize:"vertical",marginBottom:14}}
            placeholder="Décrivez l'imprévu en détail..."/>
          <Btn full onClick={handleSend} color={C.navyL} disabled={busy || !msg.trim()}>
            {busy ? "Envoi..." : "📤 Envoyer la notification"}
          </Btn>
        </div>
        <div>
          <div style={{fontWeight:700,fontSize:11,color:C.gray600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
            Destinataires
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
            {([["all","Tous"],["conducteur","Conducteur"],["mecanicien","Mécanicien"],["admin","Admin"]] as const).map(([v,l]) => (
              <button key={v} onClick={() => setTarget(v)}
                style={{padding:"7px 8px",borderRadius:8,border:`2px solid ${target===v?C.navyL:C.gray200}`,
                  background:target===v?C.skyL:C.white,fontWeight:700,fontSize:12,
                  color:target===v?C.navy:C.gray600,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>
          {target === "conducteur" && <>
            <input value={search} onChange={e => setSearch(e.target.value)}
              style={{...inputSt,marginBottom:8}} placeholder="Rechercher conducteur..."/>
            <div style={{maxHeight:200,overflowY:"auto",border:`1px solid ${C.gray200}`,borderRadius:8}}>
              <div onClick={() => setSelDrv(null)}
                style={{padding:"8px 12px",background:selDrv===null?C.skyL:C.white,
                  cursor:"pointer",borderBottom:`1px solid ${C.gray100}`,fontSize:13,fontWeight:selDrv===null?700:400}}>
                Tous les conducteurs
              </div>
              {filtered.map(d => (
                <div key={d.id} onClick={() => setSelDrv(d.id)}
                  style={{padding:"8px 12px",background:selDrv===d.id?C.skyL:C.white,cursor:"pointer",borderBottom:`1px solid ${C.gray100}`}}>
                  <div style={{fontWeight:700,fontSize:13}}>{d.prenom} {d.nom}</div>
                  <div style={{fontSize:11,color:C.gray400}}>{d.tel||"—"}</div>
                </div>
              ))}
            </div>
          </>}
          {target !== "conducteur" && (
            <div style={{background:C.amberL,borderRadius:8,padding:12,fontSize:13,color:C.amber,fontWeight:600}}>
              ⚠ Notification envoyée à{" "}
              {target==="all"?"tous les utilisateurs":target==="mecanicien"?"tous les mécaniciens":"tous les administrateurs"}.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── TabDashboard ──────────────────────────────────────────────────────────────
function TabDashboard({ drivers, vehicles, circuits, enfants, todayAbs, incidents, alerts, reparations, absencesCond,
  onOpenAbsent, onOpenChildAbs, onOpenInc, setTab }: {
  drivers: Conducteur[]; vehicles: Vehicule[]; circuits: Circuit[]; enfants: Enfant[];
  todayAbs: AbsenceEnfant[]; incidents: Incident[]; alerts: Alerte[]; reparations: Reparation[];
  absencesCond: AbsenceConducteur[];
  onOpenAbsent: (d: Conducteur) => void;
  onOpenChildAbs: (a: AbsenceEnfant) => void;
  onOpenInc: (i: Incident) => void;
  setTab: (t: TabId) => void;
}) {
  const enServiceVeh  = vehicles.filter(v => (v.etat as string) === "bon").length;
  const atelierVeh    = vehicles.filter(v => (v.etat as string) === "atelier").length;
  const enServiceDrv  = drivers.filter(d => d.status === "en_service").length;
  const absents       = drivers.filter(d => d.status === "absent");
  const openInc       = incidents.filter(i => i.status !== "resolu");
  const unread        = alerts.filter(a => !a.read);
  const activeRep     = reparations.filter(r => !["remis_en_circulation","annulee"].includes(r.statut));
  const newChildAbs   = todayAbs.filter(a => !a.read_by_gestionnaire);

  const cardStyle = (color: string): React.CSSProperties => ({
    background:C.white, borderRadius:14, padding:"18px 20px", border:`1px solid ${C.gray200}`,
    boxShadow:"0 1px 4px rgba(0,0,0,0.05)", cursor:"pointer", transition:"box-shadow .15s",
    borderTop:`3px solid ${color}`,
  });

  return (
    <div>
      {/* 6 stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:22}}>
        {/* 1 */}
        <div style={cardStyle(C.green)} onClick={() => setTab("vehicules")}>
          <div style={{fontSize:22,marginBottom:4}}>🚌</div>
          <div style={{fontSize:26,fontWeight:900,color:C.gray800}}>{enServiceVeh} <span style={{fontSize:13,fontWeight:600,color:C.gray400}}>/ {vehicles.length}</span></div>
          <div style={{fontSize:12,color:C.gray600,marginTop:2}}>Véhicules en service</div>
          <div style={{fontSize:11,color:C.gray400,marginTop:2}}>{atelierVeh} en atelier</div>
        </div>
        {/* 2 */}
        <div style={cardStyle(C.amber)} onClick={() => setTab("vehicules")}>
          <div style={{fontSize:22,marginBottom:4}}>🔧</div>
          <div style={{fontSize:26,fontWeight:900,color:atelierVeh>0?C.red:C.gray800}}>{atelierVeh}</div>
          <div style={{fontSize:12,color:C.gray600,marginTop:2}}>En réparation</div>
          <div style={{fontSize:11,color:C.gray400,marginTop:2}}>{activeRep.length} réparation(s) en cours</div>
        </div>
        {/* 3 */}
        <div style={cardStyle(C.navyL)} onClick={() => setTab("conducteurs")}>
          <div style={{fontSize:22,marginBottom:4}}>👤</div>
          <div style={{fontSize:26,fontWeight:900,color:C.gray800}}>{enServiceDrv} <span style={{fontSize:13,fontWeight:600,color:C.gray400}}>/ {drivers.length}</span></div>
          <div style={{fontSize:12,color:C.gray600,marginTop:2}}>Conducteurs présents</div>
          <div style={{fontSize:11,color:C.gray400,marginTop:2}}>{drivers.filter(d=>d.status==="disponible").length} disponibles</div>
        </div>
        {/* 4 */}
        <div style={cardStyle(C.red)} onClick={() => setTab("conducteurs")}>
          <div style={{fontSize:22,marginBottom:4}}>⚠️</div>
          <div style={{fontSize:26,fontWeight:900,color:absents.length>0?C.red:C.gray800}}>{absents.length}</div>
          <div style={{fontSize:12,color:C.gray600,marginTop:2}}>Absents du jour</div>
          <div style={{fontSize:11,color:C.gray400,marginTop:2}}>{absents.filter(d=>!!d.circuit_id).length} circuits à couvrir</div>
        </div>
        {/* 5 */}
        <div style={cardStyle(C.red)} onClick={() => setTab("incidents")}>
          <div style={{fontSize:22,marginBottom:4}}>🚨</div>
          <div style={{fontSize:26,fontWeight:900,color:openInc.length>0?C.red:C.green}}>{openInc.length}</div>
          <div style={{fontSize:12,color:C.gray600,marginTop:2}}>Incidents du jour</div>
          <div style={{fontSize:11,color:C.gray400,marginTop:2}}>{incidents.filter(i=>i.status==="resolu").length} résolus</div>
        </div>
        {/* 6 */}
        <div style={cardStyle(C.amber)} onClick={() => setTab("alertes")}>
          <div style={{fontSize:22,marginBottom:4}}>🔔</div>
          <div style={{fontSize:26,fontWeight:900,color:unread.length>0?C.amber:C.gray800}}>{unread.length}</div>
          <div style={{fontSize:12,color:C.gray600,marginTop:2}}>Alertes non lues</div>
          <div style={{fontSize:11,color:C.gray400,marginTop:2}}>{newChildAbs.length} nouvelles absences enfants</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:18}}>
        {/* Left column */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {/* Section 2 — Circuits du jour */}
          <Card>
            <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.gray200}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:700,color:C.gray800}}>🛣️ Circuits du jour</span>
              <button onClick={() => setTab("circuits")} style={{background:"none",border:"none",color:C.navyL,fontSize:12,fontWeight:700,cursor:"pointer"}}>Voir tout →</button>
            </div>
            <div style={{maxHeight:360,overflowY:"auto"}}>
              {circuits.map(circ => {
                const drv = drivers.find(d => d.circuit_id === circ.id && d.status !== "absent");
                const absDrv = drivers.find(d => d.circuit_id === circ.id && d.status === "absent");
                const isUncovered = !drv;
                return (
                  <div key={circ.id} style={{padding:"10px 16px",borderBottom:`1px solid ${C.gray100}`,
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                    background:isUncovered?"#FFF5F5":C.white}}>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      <span style={{fontSize:18,minWidth:24}}>{circ.emoji}</span>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:C.gray800}}>{circ.num}-{circ.nom}</div>
                        <div style={{fontSize:11,color:isUncovered?C.red:C.gray400,marginTop:1}}>
                          {drv ? `${drv.prenom} ${drv.nom}` :
                            absDrv
                              ? <button onClick={() => onOpenAbsent(absDrv)}
                                  style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontWeight:700,fontSize:11,padding:0}}>
                                  ⚠ Non couvert — gérer
                                </button>
                              : "—"
                          } · {circ.enfants_count} enfants
                        </div>
                      </div>
                    </div>
                    <Badge color={drv?(drv.status==="en_service"?"green":"amber"):isUncovered?"red":"gray"}>
                      {drv?statusLabel(drv.status):"Non couvert"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Section 1 — Absences conducteurs gérées */}
          {absencesCond.length > 0 && (
            <Card>
              <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.gray200}`}}>
                <span style={{fontWeight:700,color:C.gray800}}>👥 Absences gérées</span>
              </div>
              {absencesCond.slice(0,5).map(ab => {
                const absDrv  = drivers.find(d => d.id === ab.conducteur_id);
                const replDrv = drivers.find(d => d.id === ab.remplacant_id);
                const abCirc  = circuits.find(c => c.id === ab.circuit_id);
                return (
                  <div key={ab.id} style={{padding:"10px 16px",borderBottom:`1px solid ${C.gray100}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:C.gray800}}>
                        {absDrv?.prenom} {absDrv?.nom}
                        {replDrv && <span style={{color:C.green,fontWeight:600}}> → remplacé par {replDrv.prenom} {replDrv.nom}</span>}
                      </div>
                      <div style={{fontSize:11,color:C.gray400,marginTop:2}}>
                        {abCirc?.emoji} {abCirc?.nom} · {ab.motif||"—"}
                      </div>
                    </div>
                    <Badge color={ab.status==="couvert"?"green":"red"}>
                      {ab.status==="couvert"?"Couvert":"Non couvert"}
                    </Badge>
                  </div>
                );
              })}
            </Card>
          )}
        </div>

        {/* Right column */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>

          {/* Absences enfants du jour */}
          <Card>
            <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.gray200}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:700,color:C.gray800}}>
                👶 Absences enfants
                {newChildAbs.length > 0 && <span style={{color:C.red,marginLeft:4}}>({newChildAbs.length} nouvelles)</span>}
              </span>
            </div>
            {todayAbs.length === 0
              ? <div style={{padding:20,textAlign:"center",color:C.gray400,fontSize:13}}>✅ Aucune absence aujourd'hui</div>
              : todayAbs.slice(0,6).map(a => {
                const child = a.enfant || enfants.find(e => e.id === a.enfant_id);
                const circ  = circuits.find(c => c.id === a.circuit_id);
                return (
                  <div key={a.id} onClick={() => onOpenChildAbs(a)}
                    style={{padding:"10px 16px",borderBottom:`1px solid ${C.gray100}`,
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      cursor:"pointer",background:a.read_by_gestionnaire?C.white:C.amberL}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:C.gray800}}>{child?.prenom} {child?.nom}</div>
                      <div style={{fontSize:11,color:C.gray400,marginTop:1}}>
                        {a.reason} · {circ?.emoji} {circ?.nom} · {fmtTime(a.reported_at)}
                      </div>
                    </div>
                    <Badge color={a.transmitted_to_driver?"green":"amber"}>
                      {a.transmitted_to_driver?"Transmis":"À transmettre"}
                    </Badge>
                  </div>
                );
              })
            }
          </Card>

          {/* Section 3 — Incidents actifs */}
          {openInc.length > 0 && (
            <Card>
              <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.gray200}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,color:C.red}}>⚡ Incidents actifs</span>
                <button onClick={() => setTab("incidents")} style={{background:"none",border:"none",color:C.navyL,fontSize:12,fontWeight:700,cursor:"pointer"}}>Gérer →</button>
              </div>
              {openInc.slice(0,4).map(i => (
                <div key={i.id} onClick={() => onOpenInc(i)}
                  style={{padding:"10px 16px",borderBottom:`1px solid ${C.gray100}`,cursor:"pointer"}}>
                  <div style={{fontWeight:700,fontSize:12,color:C.gray800,marginBottom:2}}>{i.description.slice(0,80)}</div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                    <Badge color={i.status==="en_cours"?"blue":"amber"}>{i.status==="en_cours"?"En cours":"À traiter"}</Badge>
                    <span style={{fontSize:11,color:C.gray400}}>{i.conducteur?.prenom} {i.conducteur?.nom} · {fmtTime(i.reported_at)}</span>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Section 4 — Réparations en cours */}
          {activeRep.length > 0 && (
            <Card>
              <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.gray200}`}}>
                <span style={{fontWeight:700,color:C.gray800}}>🔧 Réparations en cours</span>
              </div>
              {activeRep.slice(0,4).map(r => (
                <div key={r.id} style={{padding:"10px 16px",borderBottom:`1px solid ${C.gray100}`}}>
                  <div style={{fontWeight:700,fontSize:13,color:C.gray800}}>{r.vehicule?.plaque || r.vehicule_id}</div>
                  <div style={{fontSize:12,color:C.gray600,marginTop:1}}>{r.description.slice(0,60)}</div>
                  <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center"}}>
                    <Badge color={(r.statut as string)==="en_cours"?"amber":(r.statut as string)==="remis_en_circulation"?"green":"blue"}>
                      {(r.statut as string).replace(/_/g," ")}
                    </Badge>
                    {r.cout && <span style={{fontSize:11,color:C.amber,fontWeight:700}}>{r.cout} CHF</span>}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── TabRapport ────────────────────────────────────────────────────────────────
function TabRapport({ drivers, incidents, absences, alerts, serviceLogs, sb, onRefresh }: {
  drivers: Conducteur[]; incidents: Incident[]; absences: AbsenceEnfant[];
  alerts: Alerte[]; serviceLogs: ServiceLog[]; sb: SB; onRefresh: () => void;
}) {
  const [period, setPeriod] = useState<Period>("today");
  const [sending, setSending] = useState(false);

  const cutoff = period==="today"?isoToday():period==="yesterday"?isoAgo(1):period==="week"?isoAgo(7):isoAgo(30);

  const filtInc  = incidents.filter(i  => i.reported_at.slice(0,10) >= cutoff && (period!=="today"||i.reported_at.slice(0,10)===isoToday()));
  const filtAbs  = absences.filter(a   => a.date_absence >= cutoff && (period!=="today"||a.date_absence===isoToday()));
  const filtLogs = serviceLogs.filter(l => l.date_service >= cutoff && (period!=="today"||l.date_service===isoToday()));
  const filtAlt  = alerts.filter(a    => a.created_at.slice(0,10) >= cutoff && (period!=="today"||a.created_at.slice(0,10)===isoToday()));

  const sendReport = async () => {
    setSending(true);
    await sb.from("alertes").insert({
      type:"rapport_admin", severity:"normale",
      message:`Rapport ${period==="today"?"du jour":period==="yesterday"?"d'hier":period==="week"?"de la semaine":"du mois"} : ${filtInc.length} incidents · ${filtAbs.length} absences enfants · ${filtLogs.length} services · ${filtAlt.length} alertes.`,
      read: false,
    });
    setSending(false);
    onRefresh();
  };

  const exportCSV = () => {
    const rows = [
      ...filtInc.map(i  => [fmtDT(i.reported_at),"Incident",i.type,i.description,i.status,i.conducteur?.nom||""]),
      ...filtAbs.map(a  => [fmtDate(a.date_absence),"Absence enfant","—",a.reason,a.transmitted_to_driver?"transmis":"en attente",""]),
      ...filtLogs.map(l => [fmtDate(l.date_service),"Service",l.is_replacement?"remplacement":"normal","",l.status,l.conducteur?.nom||""]),
    ].sort((a,b) => a[0].localeCompare(b[0]));
    downloadCSV(`rapport_${period}_${isoToday()}.csv`, rows,
      ["Date","Type","Sous-type","Description","Statut","Acteur"]);
  };

  const PERIODS: [Period,string][] = [["today","Aujourd'hui"],["yesterday","Hier"],["week","Cette semaine"],["month","Ce mois"]];

  return (
    <div>
      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {PERIODS.map(([v,l]) => (
          <button key={v} onClick={() => setPeriod(v)}
            style={{padding:"8px 18px",borderRadius:10,border:`2px solid ${period===v?C.navyL:C.gray200}`,
              background:period===v?C.navyL:C.white,color:period===v?C.white:C.gray600,
              fontWeight:700,fontSize:13,cursor:"pointer"}}>
            {l}
          </button>
        ))}
      </div>
      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <Stat label="Incidents" value={filtInc.length} sub={`${filtInc.filter(i=>i.status==="resolu").length} résolus`} icon="🚨" color={C.red}/>
        <Stat label="Absences enfants" value={filtAbs.length} sub={`${filtAbs.filter(a=>a.transmitted_to_driver).length} transmises`} icon="👶" color={C.amber}/>
        <Stat label="Services" value={filtLogs.length} sub={`${filtLogs.filter(l=>l.is_replacement).length} remplacements`} icon="🚌" color={C.navyL}/>
        <Stat label="Alertes" value={filtAlt.length} sub={`${filtAlt.filter(a=>!a.read).length} non lues`} icon="🔔" color={C.amber}/>
      </div>
      {/* Actions */}
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        <Btn onClick={sendReport} color={C.navyL} disabled={sending}>{sending?"Envoi...":"📨 Envoyer à l'admin"}</Btn>
        <Btn onClick={exportCSV} outline color={C.gray600}>📊 Télécharger CSV</Btn>
      </div>
      {/* Timeline */}
      <Card>
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.gray200}`,fontWeight:700,color:C.gray800}}>
          Chronologie
        </div>
        <div style={{maxHeight:480,overflowY:"auto"}}>
          {[
            ...filtInc.map(i => ({t:i.reported_at,icon:"🚨",label:`Incident ${i.type}`,detail:i.description.slice(0,80),status:i.status,actor:i.conducteur?`${i.conducteur.prenom} ${i.conducteur.nom}`:""})),
            ...filtAbs.map(a => {const child=a.enfant;return{t:a.reported_at,icon:"👶",label:"Absence enfant",detail:`${child?.prenom||""} ${child?.nom||""} — ${a.reason}`,status:a.transmitted_to_driver?"transmis":"en attente",actor:a.reported_by};}),
            ...filtLogs.map(l => ({t:l.created_at,icon:"🚌",label:l.is_replacement?"Remplacement":"Service",detail:l.conducteur?`${l.conducteur.prenom} ${l.conducteur.nom}`:"",status:l.status,actor:""})),
          ].sort((a,b) => b.t.localeCompare(a.t)).map((ev,i) => (
            <div key={i} style={{padding:"12px 16px",borderBottom:`1px solid ${C.gray100}`,display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{fontSize:18,marginTop:2,flexShrink:0}}>{ev.icon}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:13,color:C.gray800}}>{ev.label}</span>
                  <span style={{fontSize:11,color:C.gray400}}>{fmtDT(ev.t)}</span>
                </div>
                <div style={{fontSize:12,color:C.gray600,marginTop:2}}>{ev.detail}</div>
                {ev.actor && <div style={{fontSize:11,color:C.gray400,marginTop:1}}>Par : {ev.actor}</div>}
              </div>
            </div>
          ))}
          {filtInc.length + filtAbs.length + filtLogs.length === 0 && (
            <div style={{padding:32,textAlign:"center",color:C.gray400}}>Aucun événement pour cette période</div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── TabImprevus ───────────────────────────────────────────────────────────────
function TabImprevus({ alerts, drivers, sb, onRefresh }: {
  alerts: Alerte[]; drivers: Conducteur[]; sb: SB; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const imprevus = alerts.filter(a => a.type === "imprévu");

  const STATUS_COLOR: Record<string,string> = {true:"green",false:"amber"};
  const driverName = (id?: number) => {
    if (!id) return "Tous";
    const d = drivers.find(dr => dr.id === id);
    return d ? `${d.prenom} ${d.nom}` : `#${id}`;
  };

  const markRead = async (id: number) => {
    await sb.from("alertes").update({read:true,read_at:new Date().toISOString()}).eq("id",id);
    onRefresh();
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontWeight:800,fontSize:18,color:C.gray800}}>⚡ Imprévus</div>
        <Btn onClick={() => setOpen(true)} color={C.navyL}>+ Créer un imprévu</Btn>
      </div>
      {open && <ImprevuModal drivers={drivers} sb={sb} onClose={() => setOpen(false)} onRefresh={onRefresh}/>}
      <Card>
        {imprevus.length === 0
          ? <div style={{padding:40,textAlign:"center",color:C.gray400}}>
              <div style={{fontSize:40,marginBottom:12}}>✅</div>
              Aucun imprévu
            </div>
          : imprevus.map(a => (
            <div key={a.id} style={{padding:"12px 16px",borderBottom:`1px solid ${C.gray100}`,
              display:"flex",gap:12,alignItems:"flex-start",
              background:a.read?C.white:C.amberL}}>
              <div style={{fontSize:22,flexShrink:0}}>⚡</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:C.gray800}}>{a.message}</div>
                <div style={{fontSize:11,color:C.gray400,marginTop:3}}>
                  {fmtDT(a.created_at)} · Dest. : {driverName(a.driver_id)}
                </div>
                <div style={{marginTop:4,display:"flex",gap:6}}>
                  <Badge color={a.severity==="critique"?"red":a.severity==="haute"?"amber":"gray"}>{a.severity}</Badge>
                  <Badge color={a.read?"green":"amber"}>{a.read?"Lu":"En attente"}</Badge>
                </div>
              </div>
              {!a.read && (
                <Btn small onClick={() => markRead(a.id)} color={C.green}>✓ Lu</Btn>
              )}
            </div>
          ))
        }
      </Card>
    </div>
  );
}

// ── TabConducteurs ────────────────────────────────────────────────────────────
function TabConducteurs({ drivers, circuits, vehicles, incidents, sb, onRefresh }: {
  drivers: Conducteur[]; circuits: Circuit[]; vehicles: Vehicule[]; incidents: Incident[];
  sb: SB; onRefresh: () => void;
}) {
  const [search,  setSearch]  = useState("");
  const [selDrv,  setSelDrv]  = useState<Conducteur|null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = drivers.filter(d =>
    search.trim() === "" ||
    `${d.prenom} ${d.nom} ${d.circuit?.nom||""}`.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    downloadCSV(`conducteurs_${isoToday()}.csv`,
      drivers.map(d => [d.prenom,d.nom,d.tel||"",d.permis||"",d.permis_exp||"",
        d.circuit?.nom||"",d.vehicule?.plaque||"",statusLabel(d.status),d.affectation]),
      ["Prénom","Nom","Tél","Permis","Exp. permis","Circuit","Véhicule","Statut","Affectation"]
    );
  };

  return (
    <div>
      {(selDrv !== null || addOpen) && (
        <DriverDetailModal
          driver={addOpen ? null : selDrv}
          circuits={circuits} vehicles={vehicles} incidents={incidents} sb={sb}
          onClose={() => { setSelDrv(null); setAddOpen(false); }} onRefresh={onRefresh}/>
      )}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          style={{...inputSt,flex:1,minWidth:200}} placeholder="Rechercher conducteur, circuit..."/>
        <Btn onClick={() => setAddOpen(true)} color={C.green}>+ Ajouter</Btn>
        <Btn onClick={exportCSV} outline color={C.gray600}>📊 Export CSV</Btn>
      </div>
      <div style={{fontSize:12,color:C.gray400,marginBottom:12}}>
        {filtered.length} conducteur(s) · {drivers.filter(d=>d.status==="absent").length} absent(s) · {drivers.filter(d=>d.status==="en_service").length} en service
      </div>
      <Card>
        {filtered.map(d => {
          const circ = d.circuit || circuits.find(c => c.id === d.circuit_id);
          return (
            <div key={d.id} onClick={() => { setAddOpen(false); setSelDrv(d); }}
              style={{display:"flex",gap:14,alignItems:"center",padding:"12px 16px",
                borderBottom:`1px solid ${C.gray100}`,cursor:"pointer",
                background:d.status==="absent"?"#FFF5F5":C.white}}>
              <Avatar initials={d.photo_initials} color={d.status==="absent"?C.red:undefined}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:C.gray800}}>{d.prenom} {d.nom}</div>
                <div style={{fontSize:11,color:C.gray400,marginTop:1}}>
                  {circ ? `${circ.emoji} ${circ.nom}` : "Pas de circuit"} · {d.vehicule?.plaque||d.vehicule_id||"—"} · {d.tel||"—"}
                </div>
                {d.absence_motif && <div style={{fontSize:11,color:C.red,marginTop:1}}>{d.absence_motif}</div>}
              </div>
              <Badge color={statusColor(d.status) as "green"|"red"|"amber"|"blue"|"gray"}>
                {statusLabel(d.status)}
              </Badge>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{padding:32,textAlign:"center",color:C.gray400}}>Aucun conducteur trouvé</div>
        )}
      </Card>
    </div>
  );
}

// ── TabVehicules ──────────────────────────────────────────────────────────────
function TabVehicules({ vehicles, drivers, circuits, reparations, sb, onRefresh }: {
  vehicles: Vehicule[]; drivers: Conducteur[]; circuits: Circuit[]; reparations: Reparation[];
  sb: SB; onRefresh: () => void;
}) {
  const [search,  setSearch]  = useState("");
  const [selVeh,  setSelVeh]  = useState<Vehicule|null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = vehicles.filter(v =>
    search.trim() === "" ||
    `${v.plaque} ${v.marque} ${v.modele}`.toLowerCase().includes(search.toLowerCase())
  );

  const etatColor: Record<string,string> = {bon:C.green,attention:C.amber,atelier:C.red};
  const etatLabel: Record<string,string> = {bon:"En service",attention:"À surveiller",atelier:"En atelier"};

  const exportCSV = () => {
    downloadCSV(`vehicules_${isoToday()}.csv`,
      vehicles.map(v => [v.plaque,v.marque,v.modele,String(v.places),String(v.places_handi),v.etat,v.ct_date||"",v.assurance_date||"",String(v.km)]),
      ["Plaque","Marque","Modèle","Places","Handi","État","CT","Assurance","Km"]
    );
  };

  return (
    <div>
      {(selVeh !== null || addOpen) && (
        <VehicleDetailModal
          vehicle={addOpen ? null : selVeh}
          drivers={drivers} circuits={circuits} reparations={reparations} sb={sb}
          onClose={() => { setSelVeh(null); setAddOpen(false); }} onRefresh={onRefresh}/>
      )}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          style={{...inputSt,flex:1,minWidth:200}} placeholder="Rechercher plaque, marque..."/>
        <Btn onClick={() => setAddOpen(true)} color={C.green}>+ Ajouter</Btn>
        <Btn onClick={exportCSV} outline color={C.gray600}>📊 Export CSV</Btn>
      </div>
      <div style={{fontSize:12,color:C.gray400,marginBottom:12}}>
        {vehicles.filter(v=>(v.etat as string)==="bon").length} en service · {vehicles.filter(v=>(v.etat as string)==="atelier").length} en atelier · {vehicles.filter(v=>(v.etat as string)==="attention").length} attention
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
        {filtered.map(v => {
          const drv  = drivers.find(d => d.vehicule_id === v.id);
          const circ = circuits.find(c => c.id === v.circuit_id);
          return (
            <div key={v.id} onClick={() => { setAddOpen(false); setSelVeh(v); }}
              style={{background:C.white,borderRadius:12,padding:16,border:`1px solid ${C.gray200}`,
                borderTop:`3px solid ${etatColor[v.etat]||C.gray200}`,cursor:"pointer",
                boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontWeight:800,fontSize:15,color:C.gray800}}>{v.plaque}</div>
                  <div style={{fontSize:12,color:C.gray600}}>{v.marque} {v.modele}</div>
                </div>
                <Badge color={(v.etat as string)==="bon"?"green":(v.etat as string)==="attention"?"amber":"red"}>
                  {etatLabel[v.etat as string]||v.etat}
                </Badge>
              </div>
              <div style={{fontSize:12,color:C.gray400}}>
                <div>🪑 {v.places} places{v.places_handi>0?` + ${v.places_handi} handi`:""}</div>
                <div>📍 {circ ? `${circ.emoji} ${circ.nom}` : "Pas de circuit"}</div>
                <div>👤 {drv ? `${drv.prenom} ${drv.nom}` : "—"}</div>
                <div>🛣️ {v.km?.toLocaleString("fr-CH")} km</div>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div style={{padding:40,textAlign:"center",color:C.gray400}}>Aucun véhicule trouvé</div>
      )}
    </div>
  );
}

// ── TabCircuits ───────────────────────────────────────────────────────────────
function TabCircuits({ circuits, drivers, enfants, sb, onRefresh }: {
  circuits: Circuit[]; drivers: Conducteur[]; enfants: Enfant[];
  sb: SB; onRefresh: () => void;
}) {
  const [search,  setSearch]  = useState("");
  const [selCirc, setSelCirc] = useState<Circuit|null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = circuits.filter(c =>
    search.trim() === "" ||
    `${c.nom} ${c.num} ${c.cercle?.nom||""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {(selCirc !== null || addOpen) && (
        <CircuitDetailModal
          circuit={addOpen ? null : selCirc}
          drivers={drivers} enfants={enfants} sb={sb}
          onClose={() => { setSelCirc(null); setAddOpen(false); }} onRefresh={onRefresh}/>
      )}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          style={{...inputSt,flex:1,minWidth:200}} placeholder="Rechercher circuit, école..."/>
        <Btn onClick={() => setAddOpen(true)} color={C.green}>+ Ajouter</Btn>
      </div>
      <div style={{fontSize:12,color:C.gray400,marginBottom:12}}>
        {circuits.length} circuits · {circuits.filter(c=>!!drivers.find(d=>d.circuit_id===c.id&&d.status!=="absent")).length} couverts
      </div>
      <Card>
        {filtered.map(circ => {
          const drv  = drivers.find(d => d.circuit_id === circ.id && d.status !== "absent");
          const absDrv = drivers.find(d => d.circuit_id === circ.id && d.status === "absent");
          const circEnf = enfants.filter(e => e.circuit_id === circ.id);
          return (
            <div key={circ.id} onClick={() => { setAddOpen(false); setSelCirc(circ); }}
              style={{display:"flex",gap:12,alignItems:"center",padding:"12px 16px",
                borderBottom:`1px solid ${C.gray100}`,cursor:"pointer",
                background:(!drv&&absDrv)?"#FFF5F5":C.white}}>
              <div style={{fontSize:26,minWidth:32,textAlign:"center"}}>{circ.emoji}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:C.gray800}}>{circ.num} — {circ.nom}</div>
                <div style={{fontSize:12,color:C.gray600,marginTop:1}}>
                  {circ.cercle?.nom||"—"} · {circ.enfants_count} enfants · {circ.km_aller} km
                </div>
                <div style={{fontSize:11,color:drv?C.gray400:C.red,marginTop:1}}>
                  👤 {drv ? `${drv.prenom} ${drv.nom}` : absDrv ? `⚠ ${absDrv.prenom} ${absDrv.nom} (absent)` : "Non assigné"}
                </div>
              </div>
              <Badge color={drv?(drv.status==="en_service"?"green":"amber"):(!drv&&absDrv)?"red":"gray"}>
                {drv?statusLabel(drv.status):(!drv&&absDrv)?"Non couvert":"—"}
              </Badge>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ── TabIncidents ──────────────────────────────────────────────────────────────
function TabIncidents({ incidents, drivers, vehicles, circuits, enfants, sb, onRefresh }: {
  incidents: Incident[]; drivers: Conducteur[]; vehicles: Vehicule[]; circuits: Circuit[]; enfants: Enfant[];
  sb: SB; onRefresh: () => void;
}) {
  const [period,    setPeriod]    = useState<"today"|"week"|"month"|"year">("today");
  const [statusF,   setStatusF]   = useState<"all"|"en_attente"|"en_cours"|"resolu">("all");
  const [selInc,    setSelInc]    = useState<Incident|null>(null);
  const [addOpen,   setAddOpen]   = useState(false);
  const [newInc,    setNewInc]    = useState({type:"autre",description:"",conducteur_id:"",vehicule_id:"",circuit_id:""});
  const [saving,    setSaving]    = useState(false);

  const cutoff = period==="today"?isoToday():period==="week"?isoAgo(7):period==="month"?isoAgo(30):isoAgo(365);
  const filtered = incidents.filter(i =>
    i.reported_at.slice(0,10) >= cutoff &&
    (period!=="today"||i.reported_at.slice(0,10)===isoToday()) &&
    (statusF==="all"||i.status===statusF)
  );

  const byType: Record<string,number> = {};
  incidents.forEach(i => { byType[i.type]=(byType[i.type]||0)+1; });

  const handleAction = async (id: number, response: string, status: "en_cours"|"resolu", extra?: string) => {
    await sb.from("incidents").update({response,status,resolved_at:status==="resolu"?new Date().toISOString():null}).eq("id",id);
    if (extra === "transmis_meca") {
      const inc = incidents.find(i => i.id === id);
      await sb.from("alertes").insert({type:"transmis_meca",severity:"haute",
        message:`Incident transmis au mécanicien : ${inc?.vehicule_id||""} — ${inc?.description?.slice(0,100)||""}`,
        read:false,vehicle_id:inc?.vehicule_id});
    }
    if (extra === "immobiliser") {
      const inc = incidents.find(i => i.id === id);
      if (inc?.vehicule_id) await sb.from("vehicules").update({etat:"atelier"}).eq("id",inc.vehicule_id);
    }
    onRefresh();
    setSelInc(null);
  };

  const handleCreate = async () => {
    setSaving(true);
    await sb.from("incidents").insert({
      type:newInc.type, description:newInc.description,
      conducteur_id:newInc.conducteur_id?Number(newInc.conducteur_id):null,
      vehicule_id:newInc.vehicule_id||null,
      circuit_id:newInc.circuit_id||null,
      status:"en_attente",
    });
    setSaving(false);
    onRefresh();
    setAddOpen(false);
    setNewInc({type:"autre",description:"",conducteur_id:"",vehicule_id:"",circuit_id:""});
  };

  const exportCSV = () => {
    downloadCSV(`incidents_${isoToday()}.csv`,
      filtered.map(i => [fmtDT(i.reported_at),i.type,i.description,i.status,i.conducteur?.nom||"",i.vehicule?.plaque||"",i.circuit?.nom||""]),
      ["Date","Type","Description","Statut","Conducteur","Véhicule","Circuit"]
    );
  };

  const TYPE_LABEL: Record<string,string> = {
    panne:"🔧 Panne",voyant:"💡 Voyant",accident:"🚨 Accident",retard:"⏰ Retard",
    degradation:"🪟 Dégradation",enfant:"👶 Enfant",parent:"👨‍👩‍👧 Parent",autre:"❓ Autre",
  };

  return (
    <div>
      {selInc && (
        <IncidentActionModal
          incident={selInc} drivers={drivers} vehicles={vehicles} circuits={circuits} enfants={enfants}
          onClose={() => setSelInc(null)} onAction={handleAction}/>
      )}
      {addOpen && (
        <Modal title="Créer un incident" onClose={() => setAddOpen(false)}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div><label style={labelSt}>Type</label>
              <select style={inputSt} value={newInc.type} onChange={e=>setNewInc(p=>({...p,type:e.target.value}))}>
                {Object.entries(TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div><label style={labelSt}>Description</label>
              <textarea style={{...inputSt,minHeight:80,resize:"vertical"}}
                value={newInc.description} onChange={e=>setNewInc(p=>({...p,description:e.target.value}))}/>
            </div>
            <div><label style={labelSt}>Conducteur</label>
              <select style={inputSt} value={newInc.conducteur_id} onChange={e=>setNewInc(p=>({...p,conducteur_id:e.target.value}))}>
                <option value="">— Aucun —</option>
                {drivers.map(d=><option key={d.id} value={d.id}>{d.prenom} {d.nom}</option>)}
              </select>
            </div>
            <div><label style={labelSt}>Véhicule</label>
              <select style={inputSt} value={newInc.vehicule_id} onChange={e=>setNewInc(p=>({...p,vehicule_id:e.target.value}))}>
                <option value="">— Aucun —</option>
                {vehicles.map(v=><option key={v.id} value={v.id}>{v.plaque}</option>)}
              </select>
            </div>
            <div><label style={labelSt}>Circuit</label>
              <select style={inputSt} value={newInc.circuit_id} onChange={e=>setNewInc(p=>({...p,circuit_id:e.target.value}))}>
                <option value="">— Aucun —</option>
                {circuits.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.nom}</option>)}
              </select>
            </div>
            <Btn full onClick={handleCreate} color={C.red} disabled={saving||!newInc.description.trim()}>
              {saving?"Création...":"🚨 Créer l'incident"}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {(["today","week","month","year"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{padding:"6px 14px",borderRadius:8,border:`2px solid ${period===p?C.navyL:C.gray200}`,
                background:period===p?C.navyL:C.white,color:period===p?C.white:C.gray600,
                fontWeight:700,fontSize:12,cursor:"pointer"}}>
              {p==="today"?"Aujourd'hui":p==="week"?"Semaine":p==="month"?"Mois":"Année"}
            </button>
          ))}
          <div style={{width:1,background:C.gray200}}/>
          {(["all","en_attente","en_cours","resolu"] as const).map(s => (
            <button key={s} onClick={() => setStatusF(s)}
              style={{padding:"6px 14px",borderRadius:8,border:`2px solid ${statusF===s?C.navyL:C.gray200}`,
                background:statusF===s?C.navyL:C.white,color:statusF===s?C.white:C.gray600,
                fontWeight:700,fontSize:12,cursor:"pointer"}}>
              {s==="all"?"Tous":s==="en_attente"?"En attente":s==="en_cours"?"En cours":"Résolus"}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn small onClick={() => setAddOpen(true)} color={C.red}>+ Créer</Btn>
          <Btn small onClick={exportCSV} outline color={C.gray600}>📊 CSV</Btn>
        </div>
      </div>

      {/* Stats types */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {Object.entries(byType).slice(0,6).map(([type,count]) => (
          <div key={type} style={{background:C.white,borderRadius:8,padding:"6px 12px",border:`1px solid ${C.gray200}`,fontSize:12}}>
            {TYPE_LABEL[type]||type} <strong>{count}</strong>
          </div>
        ))}
      </div>

      <Card>
        {filtered.length === 0
          ? <div style={{padding:40,textAlign:"center",color:C.gray400}}>✅ Aucun incident</div>
          : filtered.map(i => (
            <div key={i.id} onClick={() => setSelInc(i)}
              style={{padding:"12px 16px",borderBottom:`1px solid ${C.gray100}`,cursor:"pointer",
                borderLeft:`3px solid ${i.status==="resolu"?C.green:i.status==="en_cours"?C.navyL:C.red}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                    <span style={{fontWeight:800,fontSize:13,color:C.gray800}}>
                      {TYPE_LABEL[i.type]||i.type}
                    </span>
                    <Badge color={i.status==="resolu"?"green":i.status==="en_cours"?"blue":"amber"}>
                      {i.status==="resolu"?"Résolu":i.status==="en_cours"?"En cours":"En attente"}
                    </Badge>
                  </div>
                  <div style={{fontSize:12,color:C.gray600,marginBottom:2}}>{i.description.slice(0,100)}</div>
                  <div style={{fontSize:11,color:C.gray400}}>
                    {i.conducteur?.prenom} {i.conducteur?.nom} · {i.vehicule?.plaque} · {i.circuit?.nom} · {fmtDT(i.reported_at)}
                  </div>
                  {i.response && (
                    <div style={{fontSize:11,color:C.green,marginTop:4,fontWeight:600}}>
                      💬 {i.response.slice(0,80)}
                    </div>
                  )}
                </div>
                <div style={{fontSize:18,color:C.gray400}}>→</div>
              </div>
            </div>
          ))
        }
      </Card>
    </div>
  );
}

// ── TabAlertes ────────────────────────────────────────────────────────────────
function TabAlertes({ alerts, sb, onRefresh }: {
  alerts: Alerte[]; sb: SB; onRefresh: () => void;
}) {
  const [showRead, setShowRead] = useState(false);

  const displayed = showRead ? alerts : alerts.filter(a => !a.read);

  const markRead = async (id: number) => {
    await sb.from("alertes").update({read:true,read_at:new Date().toISOString()}).eq("id",id);
    onRefresh();
  };
  const markAllRead = async () => {
    await sb.from("alertes").update({read:true,read_at:new Date().toISOString()}).eq("read",false);
    onRefresh();
  };

  const SEVERITY_ORDER: Record<string,number> = {critique:0,haute:1,normale:2};
  const sorted = [...displayed].sort((a,b) =>
    (SEVERITY_ORDER[a.severity]??2) - (SEVERITY_ORDER[b.severity]??2)
  );

  const TYPE_ICON: Record<string,string> = {
    document:"📄",vehicule:"🚌",conducteur:"👤",reparation:"🔧",
    rapport_admin:"📋","imprévu":"⚡",transmis_meca:"🔧",absence:"👶",
  };

  const critique = sorted.filter(a => a.severity === "critique");
  const haute    = sorted.filter(a => a.severity === "haute");
  const normale  = sorted.filter(a => a.severity === "normale");

  const Section = ({ title, items, color }: { title: string; items: Alerte[]; color: string }) => (
    items.length === 0 ? null : (
      <div style={{marginBottom:16}}>
        <div style={{fontWeight:800,fontSize:12,color,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8,
          display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:color}}/>
          {title} ({items.length})
        </div>
        <Card>
          {items.map(a => (
            <div key={a.id} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"12px 16px",
              borderBottom:`1px solid ${C.gray100}`,background:a.read?C.white:a.severity==="critique"?C.redL:a.severity==="haute"?C.amberL:C.white}}>
              <div style={{fontSize:22,flexShrink:0}}>{TYPE_ICON[a.type]||"🔔"}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:C.gray800}}>{a.message}</div>
                <div style={{fontSize:11,color:C.gray400,marginTop:3}}>{fmtDT(a.created_at)}</div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                <Badge color={a.severity==="critique"?"red":a.severity==="haute"?"amber":"gray"}>
                  {a.severity}
                </Badge>
                {!a.read && <Btn small onClick={() => markRead(a.id)} color={C.green}>✓ Lu</Btn>}
                {a.read && <Badge color="green">Lu</Badge>}
              </div>
            </div>
          ))}
        </Card>
      </div>
    )
  );

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div style={{fontWeight:800,fontSize:18,color:C.gray800}}>
          🔔 Alertes {alerts.filter(a=>!a.read).length > 0 && (
            <span style={{background:C.red,color:C.white,borderRadius:20,fontSize:12,fontWeight:700,padding:"2px 8px",marginLeft:8}}>
              {alerts.filter(a=>!a.read).length}
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={() => setShowRead(v => !v)}
            style={{padding:"6px 14px",borderRadius:8,border:`2px solid ${C.gray200}`,background:C.white,
              fontSize:12,fontWeight:700,color:C.gray600,cursor:"pointer"}}>
            {showRead?"Masquer lues":"Voir toutes"}
          </button>
          {alerts.some(a => !a.read) && (
            <Btn small onClick={markAllRead} color={C.green}>✓ Tout marquer lu</Btn>
          )}
        </div>
      </div>
      {displayed.length === 0
        ? <div style={{padding:48,textAlign:"center",color:C.gray400}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            Toutes les alertes sont traitées
          </div>
        : <>
          <Section title="Critique" items={critique} color={C.red}/>
          <Section title="Haute priorité" items={haute}    color={C.amber}/>
          <Section title="Normale"         items={normale}  color={C.gray400}/>
        </>
      }
    </div>
  );
}

// ── TabExports ────────────────────────────────────────────────────────────────
function TabExports({ drivers, vehicles, circuits, incidents, serviceLogs }: {
  drivers: Conducteur[]; vehicles: Vehicule[]; circuits: Circuit[];
  incidents: Incident[]; serviceLogs: ServiceLog[];
}) {
  const today = isoToday();

  const ExportSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card style={{marginBottom:16}}>
      <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.gray200}`,fontWeight:700,fontSize:15,color:C.gray800}}>
        {title}
      </div>
      <div style={{padding:16,display:"flex",gap:10,flexWrap:"wrap"}}>{children}</div>
    </Card>
  );

  return (
    <div>
      <div style={{fontWeight:800,fontSize:18,color:C.gray800,marginBottom:16}}>📊 Exports</div>

      <ExportSection title="👥 Conducteurs">
        <Btn onClick={() => downloadCSV(`conducteurs_${today}.csv`,
          drivers.map(d => [d.prenom,d.nom,d.tel||"",d.permis||"",d.permis_exp||"",
            d.circuit?.nom||"",d.vehicule?.plaque||"",statusLabel(d.status),d.affectation,d.tachygraphe?"Oui":"Non"]),
          ["Prénom","Nom","Tél","Permis","Exp. permis","Circuit","Véhicule","Statut","Affectation","Tachygraphe"]
        )} color={C.navyL}>📊 Excel (CSV)</Btn>
        <Btn onClick={() => window.print()} outline color={C.gray600}>📄 PDF (impression)</Btn>
      </ExportSection>

      <ExportSection title="🚌 Véhicules">
        <Btn onClick={() => downloadCSV(`vehicules_${today}.csv`,
          vehicles.map(v => [v.plaque,v.marque,v.modele,String(v.places),String(v.places_handi),
            v.etat,v.ct_date||"",v.assurance_date||"",String(v.km),v.circuit_id||""]),
          ["Plaque","Marque","Modèle","Places","Handi","État","CT","Assurance","Km","Circuit"]
        )} color={C.navyL}>📊 Excel (CSV)</Btn>
        <Btn onClick={() => window.print()} outline color={C.gray600}>📄 PDF QR codes</Btn>
      </ExportSection>

      <ExportSection title="🛣️ Circuits">
        <Btn onClick={() => downloadCSV(`circuits_${today}.csv`,
          circuits.map(c => [c.num,c.nom,c.emoji,c.cercle?.nom||"",String(c.enfants_count),String(c.km_aller),
            drivers.find(d=>d.circuit_id===c.id&&d.status!=="absent")?.nom||"Non couvert"]),
          ["N°","Nom","Emoji","École","Enfants","Km aller","Conducteur"]
        )} color={C.navyL}>📊 Excel (CSV)</Btn>
      </ExportSection>

      <ExportSection title="🚨 Incidents">
        <Btn onClick={() => downloadCSV(`incidents_30j_${today}.csv`,
          incidents.filter(i=>i.reported_at>isoAgo(30)).map(i => [fmtDT(i.reported_at),i.type,i.description,i.status,i.conducteur?.nom||"",i.vehicule?.plaque||"",i.circuit?.nom||"",i.response||""]),
          ["Date","Type","Description","Statut","Conducteur","Véhicule","Circuit","Réponse"]
        )} color={C.navyL}>📊 30 derniers jours</Btn>
        <Btn onClick={() => downloadCSV(`incidents_all_${today}.csv`,
          incidents.map(i => [fmtDT(i.reported_at),i.type,i.description,i.status,i.conducteur?.nom||"",i.vehicule?.plaque||"",i.circuit?.nom||"",i.response||""]),
          ["Date","Type","Description","Statut","Conducteur","Véhicule","Circuit","Réponse"]
        )} outline color={C.navyL}>Tous les incidents</Btn>
      </ExportSection>

      <ExportSection title="📋 Services">
        <Btn onClick={() => downloadCSV(`services_${today}.csv`,
          serviceLogs.map(l => [l.date_service,l.conducteur?.prenom||"",l.conducteur?.nom||"",l.circuit?.nom||"",l.heure_debut||"",l.heure_fin||"",statusLabel(l.status),l.is_replacement?"Oui":"Non",l.replacement_name||""]),
          ["Date","Prénom","Nom","Circuit","Début","Fin","Statut","Remplacement","Remplace"]
        )} color={C.navyL}>📊 Historique services</Btn>
      </ExportSection>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function GestionnaireDashboard() {
  const sb = createClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [gestPrenom,    setGestPrenom]    = useState("");
  const [drivers,       setDrivers]       = useState<Conducteur[]>([]);
  const [vehicles,      setVehicles]      = useState<Vehicule[]>([]);
  const [circuits,      setCircuits]      = useState<Circuit[]>([]);
  const [enfants,       setEnfants]       = useState<Enfant[]>([]);
  const [todayAbs,      setTodayAbs]      = useState<AbsenceEnfant[]>([]);
  const [allAbs,        setAllAbs]        = useState<AbsenceEnfant[]>([]);
  const [incidents,     setIncidents]     = useState<Incident[]>([]);
  const [alerts,        setAlerts]        = useState<Alerte[]>([]);
  const [reparations,   setReparations]   = useState<Reparation[]>([]);
  const [absencesCond,  setAbsencesCond]  = useState<AbsenceConducteur[]>([]);
  const [serviceLogs,   setServiceLogs]   = useState<ServiceLog[]>([]);
  const [loading,       setLoading]       = useState(true);

  // UI state
  const [tab,          setTab]          = useState<TabId>("dashboard");
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [absentModal,  setAbsentModal]  = useState<Conducteur|null>(null);
  const [childAbsM,    setChildAbsM]    = useState<AbsenceEnfant|null>(null);
  const [incModal,     setIncModal]     = useState<Incident|null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { data: p } = await sb.from("profiles").select("prenom").eq("id", user.id).single();
      if (p?.prenom) setGestPrenom(p.prenom);
    }

    const today    = isoToday();
    const monthAgo = isoAgo(30);

    const [drv,veh,cir,enf,absT,absA,inc,alt,rep,absCond,logs] = await Promise.all([
      sb.from("conducteurs").select("*,circuit:circuits(*,cercle:cercles_scolaires(*)),vehicule:vehicules(*)").order("nom"),
      sb.from("vehicules").select("*").order("plaque"),
      sb.from("circuits").select("*,cercle:cercles_scolaires(*)").order("num"),
      sb.from("enfants").select("*").order("nom"),
      sb.from("absences_enfants").select("*,enfant:enfants(*)").eq("date_absence",today).order("reported_at",{ascending:false}),
      sb.from("absences_enfants").select("*,enfant:enfants(*)").gte("date_absence",monthAgo).order("date_absence",{ascending:false}),
      sb.from("incidents").select("*,vehicule:vehicules(*),conducteur:conducteurs(*),circuit:circuits(*)").order("reported_at",{ascending:false}).limit(100),
      sb.from("alertes").select("*").order("created_at",{ascending:false}).limit(100),
      sb.from("reparations").select("*,vehicule:vehicules(*)").order("created_at",{ascending:false}).limit(50),
      sb.from("absences_conducteurs").select("*").order("created_at",{ascending:false}).limit(50),
      sb.from("service_logs").select("*,conducteur:conducteurs(*),circuit:circuits(*)").gte("date_service",monthAgo).order("date_service",{ascending:false}).limit(200),
    ]);

    setDrivers(drv.data ?? []);
    setVehicles(veh.data ?? []);
    setCircuits(cir.data ?? []);
    setEnfants(enf.data ?? []);
    setTodayAbs(absT.data ?? []);
    setAllAbs(absA.data ?? []);
    setIncidents(inc.data ?? []);
    setAlerts(alt.data ?? []);
    setReparations(rep.data ?? []);
    setAbsencesCond(absCond.data ?? []);
    setServiceLogs(logs.data ?? []);
    setLoading(false);
  }, [sb]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchAll();
    const ch = sb.channel("gestionnaire-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"conducteurs"},       fetchAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"vehicules"},         fetchAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"incidents"},         fetchAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"alertes"},           fetchAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"absences_enfants"},  fetchAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"absences_conducteurs"},fetchAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"reparations"},       fetchAll)
      .on("postgres_changes",{event:"*",schema:"public",table:"service_logs"},      fetchAll)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchAll, sb]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAssign = async (absentId: number, replacerId: number, circuitId: string) => {
    const absent = drivers.find(d => d.id === absentId);
    await sb.from("conducteurs").update({status:"en_service",circuit_id:circuitId}).eq("id",replacerId);
    await sb.from("absences_conducteurs").insert({
      conducteur_id:absentId, date_absence:isoToday(),
      motif:absent?.absence_motif||"", remplacant_id:replacerId,
      circuit_id:circuitId, status:"couvert",
    });
    await sb.from("alertes").insert({
      type:"conducteur", severity:"normale",
      message:`${drivers.find(d=>d.id===replacerId)?.prenom||""} ${drivers.find(d=>d.id===replacerId)?.nom||""} prend en charge le circuit de ${absent?.prenom} ${absent?.nom} (absent).`,
      read:false, driver_id:replacerId,
    });
    fetchAll();
    setAbsentModal(null);
  };

  const handleTransmit = async (absenceId: number) => {
    await sb.from("absences_enfants").update({transmitted_to_driver:true,read_by_gestionnaire:true}).eq("id",absenceId);
    fetchAll();
  };

  // ── Computed badges ─────────────────────────────────────────────────────────
  const openInc    = incidents.filter(i => i.status !== "resolu");
  const unread     = alerts.filter(a => !a.read);
  const absents    = drivers.filter(d => d.status === "absent");
  const atelierVeh = vehicles.filter(v => (v.etat as string) === "atelier").length;

  const BADGES: Record<TabId,number> = {
    dashboard:0, rapport:0,
    imprevus:   alerts.filter(a=>!a.read&&a.type==="imprévu").length,
    conducteurs:absents.length,
    vehicules:  atelierVeh,
    circuits:   0,
    incidents:  openInc.length,
    alertes:    unread.length,
    exports:    0,
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh",flexDirection:"column",gap:12,color:C.gray400}}>
      <div style={{fontSize:36}}>⏳</div>
      <div style={{fontWeight:700,fontSize:15}}>Chargement du tableau de bord…</div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{maxWidth:1400,margin:"0 auto"}}>

      {/* ── Global modals ──────────────────────────────────────────────────────── */}
      {absentModal && (
        <AssignModal driver={absentModal} drivers={drivers} circuits={circuits}
          onClose={() => setAbsentModal(null)} onAssign={handleAssign}/>
      )}
      {childAbsM && (
        <ChildAbsModal absence={childAbsM} enfants={enfants} drivers={drivers} circuits={circuits}
          onClose={() => setChildAbsM(null)} onTransmit={handleTransmit}/>
      )}
      {incModal && (
        <IncidentActionModal incident={incModal} drivers={drivers} vehicles={vehicles} circuits={circuits} enfants={enfants}
          onClose={() => setIncModal(null)}
          onAction={async (id, response, status, extra) => {
            await sb.from("incidents").update({response,status,resolved_at:status==="resolu"?new Date().toISOString():null}).eq("id",id);
            if (extra==="transmis_meca") {
              const inc=incidents.find(i=>i.id===id);
              await sb.from("alertes").insert({type:"transmis_meca",severity:"haute",
                message:`Incident transmis au mécanicien : ${inc?.vehicule_id||""} — ${inc?.description?.slice(0,100)||""}`,
                read:false,vehicle_id:inc?.vehicule_id});
            }
            if (extra==="immobiliser") {
              const inc=incidents.find(i=>i.id===id);
              if (inc?.vehicule_id) await sb.from("vehicules").update({etat:"atelier"}).eq("id",inc.vehicule_id);
            }
            fetchAll();
            setIncModal(null);
          }}/>
      )}

      {/* ── Welcome banner ──────────────────────────────────────────────────────── */}
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyL})`,borderRadius:16,padding:"22px 28px",
        marginBottom:20,color:C.white,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:900,marginBottom:2}}>
            Bonjour {gestPrenom} !
          </div>
          <div style={{fontSize:13,opacity:0.8,marginBottom:6}}>
            Plateforme de gestion Taxi Romontois · Vue temps réel
          </div>
          <div style={{fontSize:12,opacity:0.6}}>{todayStr()}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {openInc.length > 0 && (
            <div style={{background:"rgba(220,38,38,0.3)",borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700}}>
              ⚡ {openInc.length} incident(s)
            </div>
          )}
          {absents.length > 0 && (
            <div style={{background:"rgba(217,119,6,0.3)",borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700}}>
              ⚠ {absents.length} absent(s)
            </div>
          )}
          {unread.length > 0 && (
            <div style={{background:"rgba(255,255,255,0.15)",borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700}}>
              🔔 {unread.length} alerte(s)
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile hamburger drawer ─────────────────────────────────────────────── */}
      <div className="tx-mobile-header" style={{
        position:"sticky",top:0,zIndex:200,background:C.white,borderBottom:`1px solid ${C.gray200}`,
        padding:"0 16px",height:48,alignItems:"center",justifyContent:"space-between",marginBottom:12,
        marginLeft:-16,marginRight:-16,width:"calc(100% + 32px)",
      }}>
        <div style={{fontWeight:700,fontSize:14,color:C.navy}}>
          {TABS.find(t=>t.id===tab)?.icon} {TABS.find(t=>t.id===tab)?.label}
        </div>
        <button onClick={() => setDrawerOpen(v => !v)}
          style={{background:"none",border:"none",cursor:"pointer",padding:8,fontSize:20,color:C.navy}}>
          ☰
        </button>
      </div>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div style={{position:"fixed",inset:0,zIndex:500,display:"flex"}}>
          <div style={{flex:1,background:"rgba(0,0,0,0.4)"}} onClick={() => setDrawerOpen(false)}/>
          <div style={{width:260,background:C.white,height:"100%",overflowY:"auto",boxShadow:"-4px 0 20px rgba(0,0,0,0.2)"}}>
            <div style={{padding:"16px 16px 8px",borderBottom:`1px solid ${C.gray100}`,fontWeight:800,fontSize:15,color:C.navy}}>
              Navigation
            </div>
            {TABS.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setDrawerOpen(false); }}
                style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
                  border:"none",background:tab===t.id?C.skyL:C.white,
                  color:tab===t.id?C.navy:C.gray800,fontWeight:tab===t.id?700:400,
                  fontSize:14,cursor:"pointer",textAlign:"left",borderBottom:`1px solid ${C.gray100}`}}>
                <span style={{fontSize:18}}>{t.icon}</span>
                <span style={{flex:1}}>{t.label}</span>
                {BADGES[t.id] > 0 && (
                  <span style={{background:C.red,color:C.white,borderRadius:20,fontSize:11,fontWeight:700,padding:"1px 7px"}}>
                    {BADGES[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── PC tab bar ────────────────────────────────────────────────────────────── */}
      <div style={{overflowX:"auto",marginBottom:20}}>
        <div style={{display:"flex",gap:4,minWidth:"max-content",borderBottom:`2px solid ${C.gray100}`,paddingBottom:0}}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",border:"none",
                background:"transparent",borderBottom:`2px solid ${tab===t.id?C.navy:"transparent"}`,
                color:tab===t.id?C.navy:C.gray400,fontWeight:tab===t.id?700:400,
                fontSize:13,cursor:"pointer",transition:"color .15s",whiteSpace:"nowrap",marginBottom:-2}}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {BADGES[t.id] > 0 && (
                <span style={{background:C.red,color:C.white,borderRadius:20,fontSize:10,fontWeight:700,padding:"1px 6px",minWidth:16}}>
                  {BADGES[t.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────────────── */}
      {tab === "dashboard" && (
        <TabDashboard
          drivers={drivers} vehicles={vehicles} circuits={circuits} enfants={enfants}
          todayAbs={todayAbs} incidents={incidents} alerts={alerts}
          reparations={reparations} absencesCond={absencesCond}
          onOpenAbsent={setAbsentModal}
          onOpenChildAbs={setChildAbsM}
          onOpenInc={setIncModal}
          setTab={setTab}/>
      )}
      {tab === "rapport" && (
        <TabRapport
          drivers={drivers} incidents={incidents} absences={allAbs}
          alerts={alerts} serviceLogs={serviceLogs} sb={sb} onRefresh={fetchAll}/>
      )}
      {tab === "imprevus" && (
        <TabImprevus alerts={alerts} drivers={drivers} sb={sb} onRefresh={fetchAll}/>
      )}
      {tab === "conducteurs" && (
        <TabConducteurs
          drivers={drivers} circuits={circuits} vehicles={vehicles}
          incidents={incidents} sb={sb} onRefresh={fetchAll}/>
      )}
      {tab === "vehicules" && (
        <TabVehicules
          vehicles={vehicles} drivers={drivers} circuits={circuits}
          reparations={reparations} sb={sb} onRefresh={fetchAll}/>
      )}
      {tab === "circuits" && (
        <TabCircuits
          circuits={circuits} drivers={drivers} enfants={enfants}
          sb={sb} onRefresh={fetchAll}/>
      )}
      {tab === "incidents" && (
        <TabIncidents
          incidents={incidents} drivers={drivers} vehicles={vehicles}
          circuits={circuits} enfants={enfants} sb={sb} onRefresh={fetchAll}/>
      )}
      {tab === "alertes" && (
        <TabAlertes alerts={alerts} sb={sb} onRefresh={fetchAll}/>
      )}
      {tab === "exports" && (
        <TabExports
          drivers={drivers} vehicles={vehicles} circuits={circuits}
          incidents={incidents} serviceLogs={serviceLogs}/>
      )}
    </div>
  );
}

// ── IncidentActionModal ───────────────────────────────────────────────────────
function IncidentActionModal({ incident, drivers, vehicles, circuits, enfants, onClose, onAction }: {
  incident: Incident; drivers: Conducteur[]; vehicles: Vehicule[];
  circuits: Circuit[]; enfants: Enfant[];
  onClose: () => void;
  onAction: (id: number, response: string, status: "en_cours"|"resolu", extra?: string) => Promise<void>;
}) {
  const [response, setResponse] = useState(incident.response || "");
  const [status,   setStatus]   = useState<"en_cours"|"resolu">(
    incident.status === "resolu" ? "resolu" : "en_cours"
  );
  const [busy, setBusy] = useState(false);

  const drv  = incident.conducteur || drivers.find(d => d.id === incident.conducteur_id);
  const veh  = incident.vehicule   || vehicles.find(v => v.id === incident.vehicule_id);
  const circ = incident.circuit    || circuits.find(c => c.id === incident.circuit_id);
  const circEnfants = enfants.filter(e => e.circuit_id === incident.circuit_id);

  const TYPE_LABEL: Record<string,string> = {
    panne:"🔧 Panne véhicule", voyant:"💡 Voyant moteur", accident:"🚨 Accident",
    retard:"⏰ Retard", degradation:"🪟 Dégradation", enfant:"👶 Problème enfant",
    parent:"👨‍👩‍👧 Problème parent", autre:"❓ Autre",
  };
  const isPanne    = ["panne","voyant","accident","degradation"].includes(incident.type);
  const isRetard   = incident.type === "retard";
  const isPersonne = ["enfant","parent"].includes(incident.type);

  const quickAction = async (msg: string, extra?: string) => {
    setBusy(true);
    await onAction(incident.id, msg, "en_cours", extra);
    setBusy(false);
    onClose();
  };

  const handleSave = async () => {
    setBusy(true);
    await onAction(incident.id, response, status);
    setBusy(false);
    onClose();
  };

  return (
    <Modal title="Traiter l'incident" onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        {/* Détails */}
        <div>
          <div style={{fontWeight:800,fontSize:15,color:C.gray800,marginBottom:6}}>
            {TYPE_LABEL[incident.type] || incident.type}
          </div>
          <Badge color={incident.status==="resolu"?"green":incident.status==="en_cours"?"blue":"amber"}>
            {incident.status==="resolu"?"Résolu":incident.status==="en_cours"?"En cours":"En attente"}
          </Badge>
          <div style={{background:C.gray50,borderRadius:10,padding:14,margin:"12px 0",fontSize:13,color:C.gray800,lineHeight:1.5}}>
            {incident.description}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <InfoBox label="Signalé le"   value={fmtDT(incident.reported_at)}/>
            <InfoBox label="Conducteur"   value={drv ? `${drv.prenom} ${drv.nom}` : "—"}/>
            <InfoBox label="Véhicule"     value={veh?.plaque || "—"}/>
            <InfoBox label="Circuit"      value={circ ? `${circ.emoji} ${circ.nom}` : "—"}/>
            {drv?.tel && <InfoBox label="Tél. conducteur" value={drv.tel} full/>}
          </div>
          {isPersonne && circEnfants.length > 0 && (
            <div style={{marginTop:12}}>
              <div style={{fontWeight:700,fontSize:11,color:C.gray600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                Enfants du circuit
              </div>
              {circEnfants.slice(0, 5).map(e => (
                <div key={e.id} style={{background:C.white,border:`1px solid ${C.gray200}`,borderRadius:8,padding:"6px 10px",marginBottom:5}}>
                  <div style={{fontWeight:700,fontSize:12}}>{e.prenom} {e.nom}</div>
                  {e.parent_nom && <div style={{fontSize:11,color:C.gray600}}>{e.parent_nom} · {e.parent_tel || "—"}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div>
          <div style={{fontWeight:700,fontSize:11,color:C.gray600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>
            Actions disponibles
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            {isPanne && <>
              <Btn onClick={() => quickAction("Incident transmis au mécanicien.","transmis_meca")} small color={C.navyL} disabled={busy}>
                🔧 Envoyer au mécanicien
              </Btn>
              <Btn onClick={() => quickAction(`Véhicule ${veh?.plaque||""} immobilisé en atelier.`,"immobiliser")} small color={C.red} disabled={busy}>
                🚫 Immobiliser le véhicule
              </Btn>
            </>}
            {isRetard && <>
              <Btn onClick={() => quickAction(`École ${circ?.cercle?.nom||""} informée du retard.`)} small color={C.amber} disabled={busy}>
                🏫 Informer l'école
              </Btn>
              <Btn onClick={() => quickAction(`Parents du circuit ${circ?.nom||""} informés du retard.`,"informer_parents")} small color={C.navyL} disabled={busy}>
                👨‍👩‍👧 Informer les parents
              </Btn>
            </>}
            {isPersonne && <>
              <Btn onClick={() => quickAction(`Parent contacté — circuit ${circ?.nom||""}.`)} small color={C.amber} disabled={busy}>
                📞 Contacter le parent
              </Btn>
              <Btn onClick={() => quickAction(`École ${circ?.cercle?.nom||""} contactée.`)} small color={C.navyL} disabled={busy}>
                🏫 Contacter l'école
              </Btn>
            </>}
          </div>

          <div style={{marginBottom:10}}>
            <label style={labelSt}>Commentaire / réponse au conducteur</label>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={4}
              style={{...inputSt,resize:"vertical"}}
              placeholder="Votre réponse visible par le conducteur..."/>
          </div>

          <div style={{marginBottom:12}}>
            <label style={labelSt}>Statut</label>
            <div style={{display:"flex",gap:8}}>
              {(["en_cours","resolu"] as const).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  style={{flex:1,padding:"8px 10px",borderRadius:8,
                    border:`2px solid ${status===s?(s==="resolu"?C.green:C.navyL):C.gray200}`,
                    background:status===s?(s==="resolu"?C.greenL:C.skyL):C.white,
                    color:status===s?(s==="resolu"?C.green:C.navyL):C.gray600,
                    fontWeight:700,fontSize:12,cursor:"pointer"}}>
                  {s === "resolu" ? "✅ Résolu" : "🔄 En cours"}
                </button>
              ))}
            </div>
          </div>

          <Btn full onClick={handleSave} color={status==="resolu"?C.green:C.navyL} disabled={busy}>
            {busy ? "Sauvegarde..." : status==="resolu" ? "✅ Résoudre l'incident" : "💾 Enregistrer"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}


