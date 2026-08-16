"use client";
import { useEffect, useRef, useState } from "react";
import { Navigation, School } from "lucide-react";
import { C } from "@/lib/constants";
import { circuitImage } from "@/lib/circuit-images";
import type { Conducteur, Eleve, PriseEnCharge } from "@/lib/types";

type CircType = { nom?: string; emoji?: string; id?: string };

// Destination (Fondation Mérine) — fallback tant que les écoles n'ont pas leurs coordonnées.
const ECOLE = { nom: "Fondation Mérine", adr: "Rue du Château 47, 1510 Moudon", lat: 46.6692349, lon: 6.7932469, tel: "021 905 30 30" };
const CENTRAL_TEL = "024 455 44 80";
const ARRIVEE = "08:25";

export interface ExcToday { eleve_id: number; type: "absent" | "parent" | "changement_circuit"; moments?: string[] | null; }

interface TourneeProps {
  driver: Conducteur;
  circ?: CircType;
  matin: Eleve[];
  aprem: Eleve[];
  prises: PriseEnCharge[];                 // toutes les prises du jour (aller + retour)
  exceptions?: ExcToday[];
  enService: boolean;
  serviceFini?: boolean;
  onMarquerEleve: (eleveId: number, statut: "present" | "absent", sens: "aller" | "retour") => Promise<void>;
  onShowConfirm: () => void;
  onShowFin: () => void;
  onReopenService?: () => void;
  onShowReprise: () => void;
}

const EXC_INFO: Record<string, { label: string; color: string; bg: string }> = {
  absent: { label: "Absent — ne pas récupérer", color: "#b42323", bg: "#FDECEC" },
  parent: { label: "Ramené par les parents — ne pas récupérer", color: "#92600b", bg: "#FEF3C7" },
  changement_circuit: { label: "Sur un autre circuit aujourd'hui", color: "#6B21A8", bg: "#EDE9FE" },
};

const gmapsAddr = (adr: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adr)}`;
const gmapsLL = (la: number, lo: number) => `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}`;
const cleanTel = (t?: string) => (t || "").replace(/\s/g, "");
const initials = (e: Eleve) => ((e.prenom_initiale?.[0] || "") + (e.nom_famille?.[0] || "")).toUpperCase();
const byHeure = (a: Eleve, b: Eleve) => (a.heure_ramassage || "~~").localeCompare(b.heure_ramassage || "~~");

function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.L) return resolve(w.L);
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css"; link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("load", () => resolve((window as any).L)); existing.addEventListener("error", reject); return; }
    const s = document.createElement("script");
    s.id = "leaflet-js"; s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve((window as any).L); s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function TabTournee({ driver, circ, matin, aprem, prises, exceptions = [], enService, serviceFini = false, onMarquerEleve, onShowConfirm, onShowFin, onReopenService, onShowReprise }: TourneeProps) {
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mapError, setMapError] = useState(false);
  const [arrived, setArrived] = useState(false);        // arrivé sur place à l'arrêt courant
  const [ecolePassed, setEcolePassed] = useState(false); // dépose école faite (transition matin → après-midi)

  // Exceptions sensibles au moment de la journée :
  //  moments vide/null = toute la journée ; 'matin' → matin (aller) ; 'apresmidi'/'soir' → après-midi (retour) ; 'midi' → aucun effet sur les tournées modélisées.
  const excFor = new Map<number, ExcToday>(exceptions.map(x => [x.eleve_id, x]));
  const excApplies = (id: number, sens: "aller" | "retour"): boolean => {
    const x = excFor.get(id);
    if (!x) return false;
    const m = x.moments;
    if (!m || m.length === 0) return true;
    return sens === "aller" ? m.includes("matin") : (m.includes("apresmidi") || m.includes("soir"));
  };
  const hasExcAller  = (e: Eleve) => excApplies(e.id, "aller");
  const hasExcRetour = (e: Eleve) => excApplies(e.id, "retour");

  const matinList = [...matin].sort(byHeure);
  const apremList = [...aprem].sort(byHeure);

  const priseAllerBy = new Map(prises.filter(p => p.sens === "aller").map(p => [p.eleve_id, p]));
  const priseRetourBy = new Map(prises.filter(p => p.sens === "retour").map(p => [p.eleve_id, p]));

  // Un enfant absent le matin (marqué "absent" sur place) n'est PAS à l'école :
  // il ne doit donc pas compter dans les déposes de l'après-midi.
  const allerAbsent = (e: Eleve) => priseAllerBy.get(e.id)?.statut === "absent";
  const skipDay = (e: Eleve) => hasExcRetour(e) || allerAbsent(e);

  const doneMatin = (e: Eleve) => priseAllerBy.has(e.id) || hasExcAller(e);
  const doneAprem = (e: Eleve) => priseRetourBy.has(e.id) || skipDay(e);

  const curMatinIdx = matinList.findIndex(e => !doneMatin(e));
  const curApremIdx = apremList.findIndex(e => !doneAprem(e));
  const matinComplete = matinList.length === 0 || curMatinIdx === -1;
  const apremComplete = apremList.length === 0 || curApremIdx === -1;
  const dayComplete = matinComplete && apremComplete;
  const apremStarted = priseRetourBy.size > 0;

  const matinActive = matinList.filter(e => !hasExcAller(e)).length;
  const apremActive = apremList.filter(e => !skipDay(e)).length;

  // Cartes d'exceptions par phase (selon le moment)
  const matinExcMap = new Map<number, string>();
  matinList.forEach(e => { const x = excFor.get(e.id); if (x && hasExcAller(e)) matinExcMap.set(e.id, x.type); });
  const apremExcMap = new Map<number, string>();
  apremList.forEach(e => { const x = excFor.get(e.id); if (x && hasExcRetour(e)) apremExcMap.set(e.id, x.type); });
  apremList.forEach(e => { if (allerAbsent(e) && !apremExcMap.has(e.id)) apremExcMap.set(e.id, "absent"); });
  const presMatin = [...priseAllerBy.values()].filter(p => p.statut === "present").length;
  const presAprem = [...priseRetourBy.values()].filter(p => p.statut === "present").length;

  const inMatin = !matinComplete;
  const curList = inMatin ? matinList : apremList;
  const curIdx = inMatin ? curMatinIdx : curApremIdx;
  const cur = curList[curIdx];
  const img = circuitImage(driver.circuit_id);
  const withCoords = curList.filter(e => e.lat != null && e.lon != null);
  const dateStr = new Date().toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" });

  // ── Carte (arrêts de la phase en cours) ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!enService || !mapDiv.current || withCoords.length === 0) return;
    loadLeaflet().then((L) => {
      if (cancelled || !mapDiv.current) return;
      try {
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        const map = L.map(mapDiv.current, { zoomControl: false, attributionControl: false });
        mapRef.current = map;
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);
        const pts: [number, number][] = [];
        curList.forEach((e, k) => {
          if (e.lat == null || e.lon == null) return;
          const done = inMatin ? doneMatin(e) : doneAprem(e);
          const isCur = k === curIdx;
          const col = done ? "#0E9F6E" : isCur ? "#E02424" : "#0D3B7A";
          L.marker([e.lat, e.lon], { icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
            html: `<div style="background:${col};color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${done ? "✓" : k + 1}</div>` }) })
            .addTo(map).bindPopup(`<b>${e.prenom_initiale} ${e.nom_famille}</b><br>${e.adresse || ""}`);
          pts.push([e.lat, e.lon]);
        });
        L.marker([ECOLE.lat, ECOLE.lon], { icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14],
          html: `<div style="background:#fff;border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:15px;border:2px solid #0D3B7A;box-shadow:0 1px 4px rgba(0,0,0,.3)">🏫</div>` }) }).addTo(map);
        pts.push([ECOLE.lat, ECOLE.lon]);
        if (pts.length) { map.fitBounds(pts, { padding: [30, 30] }); }
        setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 200);
      } catch { setMapError(true); }
    }).catch(() => setMapError(true));
    return () => { cancelled = true; if (mapRef.current) { try { mapRef.current.remove(); } catch { /* noop */ } mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enService, driver.circuit_id, inMatin, curIdx, prises.length]);

  // ── En-tête ─────────────────────────────────────────────────────────────────
  const header = (
    <div style={{ background: "linear-gradient(160deg,#12498f,#0D3B7A)", borderRadius: 20, padding: "18px 20px",
      color: "#fff", marginBottom: 14, display: "flex", alignItems: "center", gap: 16, boxShadow: "0 6px 20px rgba(13,59,122,.25)" }}>
      {img
        ? <div style={{ width: 84, height: 84, borderRadius: 18, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
            <img src={img} alt={circ?.nom || ""} style={{ width: 72, height: 72, objectFit: "contain" }} />
          </div>
        : <div style={{ fontSize: 56 }}>{circ?.emoji || "🚌"}</div>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, opacity: .85, fontWeight: 600, letterSpacing: ".3px", textTransform: "uppercase" }}>Ma tournée · {dateStr}</div>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-.4px", marginTop: 1 }}>{circ?.nom || "Circuit"}</div>
        <div style={{ fontSize: 12.5, opacity: .85, marginTop: 3 }}>
          {matinActive} ramassage{matinActive > 1 ? "s" : ""} · {apremActive} dépose{apremActive > 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );

  const bigBtn = (label: string, onClick: () => void, kind: "go" | "ok" | "navy" = "go") => (
    <button onClick={onClick} style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", marginBottom: 12,
      background: kind === "navy" ? C.navy : kind === "ok" ? "linear-gradient(160deg,#12b981,#0E9F6E)" : "linear-gradient(160deg,#12498f,#0D3B7A)",
      color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: "0 4px 14px rgba(13,59,122,.22)",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{label}</button>
  );

  const navBtn = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ width: "100%", padding: "14px", borderRadius: 14, marginBottom: 10,
      background: "#EFF6FF", color: C.navy, fontWeight: 800, fontSize: 15, textDecoration: "none",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <Navigation size={17} /> {label}
    </a>
  );

  const telChip = (label: string, num: string, kind?: "p" | "s") => (
    <a href={`tel:${cleanTel(num)}`} style={{ ...cbtn(kind), display: "flex", flexDirection: "column", gap: 2, padding: "9px 10px" }}>
      <span style={{ fontSize: 12, fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".2px" }}>{num}</span>
    </a>
  );
  const contacts = (e: Eleve) => (
    <div style={{ display: "flex", gap: 7, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.gray100}`, flexWrap: "wrap" }}>
      {e.tel_mere && telChip("📞 Mère", e.tel_mere, "p")}
      {e.tel_pere && telChip("📞 Père", e.tel_pere, "p")}
      {telChip("🏫 École", ECOLE.tel, "s")}
      {telChip("🏢 Central", CENTRAL_TEL)}
    </div>
  );
  function cbtn(kind?: "p" | "s"): React.CSSProperties {
    return { flex: 1, minWidth: "calc(50% - 4px)", textAlign: "center", textDecoration: "none", fontSize: 12.5, fontWeight: 700,
      padding: "10px 8px", borderRadius: 11, border: `1px solid ${C.gray200}`,
      color: kind === "p" ? "#b42323" : C.navy, background: kind === "p" ? "#FDECEC" : kind === "s" ? "#EFF6FF" : "#fff" };
  }

  const dayList = (
    <DayList matin={matinList} aprem={apremList} priseAllerBy={priseAllerBy} priseRetourBy={priseRetourBy}
      matinExcMap={matinExcMap} apremExcMap={apremExcMap} curMatinIdx={enService && inMatin ? curMatinIdx : -1} curApremIdx={enService && !inMatin ? curApremIdx : -1} />
  );

  // ── 0bis) Aucun circuit attribué ────────────────────────────────────────────
  if (!driver.circuit_id) {
    return (
      <div>
        <div style={{ background: "#fff", borderRadius: 16, padding: "28px 20px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 38 }}>🚌</div>
          <div style={{ fontSize: 19, fontWeight: 900, color: C.navy }}>Aucun circuit attribué pour le moment</div>
          <p style={{ color: "#475569", fontSize: 14, marginTop: 8, lineHeight: 1.55 }}>
            Dès qu&apos;un responsable vous assigne un circuit (par exemple à la <b>Fondation Mérine</b>),
            votre tournée du matin et de l&apos;après-midi apparaîtra ici automatiquement.
          </p>
        </div>
      </div>
    );
  }

  // ── 0) Service terminé aujourd'hui → FÉLICITATIONS ──────────────────────────
  if (!enService && serviceFini && driver.status !== "absent") {
    return (
      <div>
        {header}
        <div style={{ textAlign: "center", padding: "26px 16px" }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 44 }}>🎉</div>
          <div style={{ color: C.green, fontSize: 22, fontWeight: 900 }}>Service terminé — félicitations !</div>
          <p style={{ color: "#475569", fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
            Vous avez assuré votre journée (matin et après-midi).<br />Merci et bon repos.
          </p>
        </div>
        {onReopenService && (
          <button onClick={onReopenService}
            style={{ width: "100%", padding: "13px", borderRadius: 14, border: `1.5px solid ${C.gray200}`, background: "#fff", color: C.navy, fontWeight: 800, fontSize: 15, cursor: "pointer", marginBottom: 12 }}>
            Reprendre le service
          </button>
        )}
        {dayList}
      </div>
    );
  }

  // ── 1) Pas encore en service → BRIEFING de la journée ───────────────────────
  if (!enService) {
    const first = matinList[0];
    return (
      <div>
        {header}
        {driver.status === "absent" ? (
          <>
            <div style={{ background: C.redL, borderRadius: 14, padding: 14, marginBottom: 12, color: C.red, fontWeight: 700 }}>
              Absence en cours{driver.absence_motif ? ` — ${driver.absence_motif}` : ""}
            </div>
            {bigBtn("Je reprends le service", onShowReprise, "ok")}
          </>
        ) : (
          <>
            <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.navy, marginBottom: 6 }}>Voici votre journée</div>
              <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
                Le matin, vous récupérez <b>{matinActive} enfant{matinActive > 1 ? "s" : ""}</b> pour la <b>Fondation Mérine</b> ({ARRIVEE}).
                L&apos;après-midi, vous les ramenez chez eux (<b>{apremActive} dépose{apremActive > 1 ? "s" : ""}</b>).
                {first?.heure_ramassage ? <> Premier ramassage à <b>{first.heure_ramassage}</b>.</> : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                {[["Ramassages", String(matinActive)], ["Déposes", String(apremActive)], ["Premier", first?.heure_ramassage || "—"], ["Arrivée école", ARRIVEE]].map(([l, v]) => (
                  <div key={l} style={{ background: "#F8FAFC", border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: C.navy }}>{v}</div>
                    <div style={{ fontSize: 11.5, color: C.gray, marginTop: 1 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
            {bigBtn("Démarrer la journée", onShowConfirm, "ok")}
          </>
        )}
        {dayList}
      </div>
    );
  }

  // ── 2) Journée terminée (tout fait) → fin de service ────────────────────────
  if (dayComplete) {
    return (
      <div>
        {header}
        <div style={{ textAlign: "center", padding: "22px 16px" }}>
          <div style={{ width: 84, height: 84, borderRadius: "50%", background: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 42 }}>🎉</div>
          <div style={{ color: C.green, fontSize: 22, fontWeight: 900 }}>Journée terminée !</div>
          <p style={{ color: "#475569", fontSize: 14, marginTop: 6 }}>Matin et après-midi assurés. Vous pouvez terminer votre service.</p>
        </div>
        {bigBtn("Je termine mon service", onShowFin, "navy")}
        {dayList}
      </div>
    );
  }

  // ── 3) Transition école : matin fini, après-midi pas commencé ───────────────
  if (matinComplete && !apremStarted && !ecolePassed && apremList.length > 0) {
    return (
      <div>
        {header}
        <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>🏫 Dépose à l&apos;école</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#1E293B" }}>{ECOLE.nom}</div>
          <div style={{ fontSize: 13, color: C.gray, marginTop: 2 }}>{ECOLE.adr}</div>
          <p style={{ fontSize: 13.5, color: "#475569", margin: "10px 0 0" }}>
            {presMatin} enfant{presMatin > 1 ? "s" : ""} déposé{presMatin > 1 ? "s" : ""} à Mérine. Quand c&apos;est fait, commencez l&apos;après-midi.
          </p>
          <div style={{ marginTop: 14 }}>
            {navBtn(gmapsLL(ECOLE.lat, ECOLE.lon), "Itinéraire vers l'école")}
            {bigBtn("Commencer la tournée de l'après-midi", () => setEcolePassed(true), "ok")}
          </div>
        </div>
        {dayList}
      </div>
    );
  }

  // ── 4) Arrêt courant (ramassage le matin, dépose l'après-midi) ──────────────
  const sensCourant: "aller" | "retour" = inMatin ? "aller" : "retour";
  return (
    <div>
      {header}
      {!mapError && withCoords.length > 0 && <div ref={mapDiv} style={{ height: 200, borderRadius: 16, overflow: "hidden", border: `1px solid ${C.gray200}`, marginBottom: 12, background: "#dce6f2" }} />}
      {/* Progression */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#475569" }}>{inMatin ? "Matin — à récupérer" : "Après-midi — à déposer"}</span>
        <div style={{ flex: 1, height: 7, background: C.gray200, borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round((inMatin ? presMatin : presAprem) / ((inMatin ? matinActive : apremActive) || 1) * 100)}%`, background: C.green, borderRadius: 99, transition: "width .3s" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.green }}>{inMatin ? presMatin : presAprem}/{inMatin ? matinActive : apremActive}</span>
      </div>
      {cur && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: arrived ? C.amber : C.navy, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
            {inMatin
              ? (arrived ? "📍 Sur place — récupérez l'enfant" : curIdx === 0 ? "🚸 Premier enfant à récupérer" : "🚸 Prochain enfant")
              : (arrived ? "📍 Sur place — déposez l'enfant" : "🏠 Prochaine dépose")}
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
            <div style={{ width: 50, height: 50, borderRadius: 15, background: "linear-gradient(160deg,#12498f,#0D3B7A)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{initials(cur)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#1E293B" }}>{cur.prenom_initiale} {cur.nom_famille}</div>
              <div style={{ fontSize: 13.5, color: "#475569", marginTop: 2 }}>📍 {cur.adresse || "Adresse non renseignée"}</div>
            </div>
            {cur.heure_ramassage && (
              <div style={{ background: "#EFF6FF", color: C.navy, borderRadius: 12, padding: "6px 11px", textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{cur.heure_ramassage}</div>
                <div style={{ fontSize: 9.5, fontWeight: 700, opacity: .7 }}>PRÉVU</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 13 }}>
            {!arrived ? (<>
              {cur.adresse ? navBtn(gmapsAddr(cur.adresse), "Ouvrir l'itinéraire") : (cur.lat != null && cur.lon != null ? navBtn(gmapsLL(cur.lat, cur.lon), "Ouvrir l'itinéraire") : null)}
              {bigBtn("Arrivé sur place", () => setArrived(true))}
            </>) : inMatin ? (<>
              {bigBtn(`✓ ${cur.prenom_initiale} est monté(e)`, async () => { await onMarquerEleve(cur.id, "present", sensCourant); setArrived(false); }, "ok")}
              <button onClick={async () => { await onMarquerEleve(cur.id, "absent", sensCourant); setArrived(false); }}
                style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1.5px solid #f3d0d0", background: "#fff", color: "#b42323", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                Absent aujourd&apos;hui
              </button>
            </>) : (
              bigBtn(`✓ ${cur.prenom_initiale} est déposé(e)`, async () => { await onMarquerEleve(cur.id, "present", sensCourant); setArrived(false); }, "ok")
            )}
          </div>
          {contacts(cur)}
        </div>
      )}
      {dayList}
    </div>
  );
}

// ── Liste de la journée : matin (ramassage) → école → après-midi (dépose) ──────
function DayList({ matin, aprem, priseAllerBy, priseRetourBy, matinExcMap, apremExcMap, curMatinIdx, curApremIdx }:
  { matin: Eleve[]; aprem: Eleve[]; priseAllerBy: Map<number, PriseEnCharge>; priseRetourBy: Map<number, PriseEnCharge>;
    matinExcMap: Map<number, string>; apremExcMap: Map<number, string>; curMatinIdx: number; curApremIdx: number }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)", overflow: "hidden", marginTop: 4 }}>
      <SectionHead label="☀️ Matin — ramassage" />
      {matin.length === 0
        ? <Empty text="Aucun ramassage." />
        : matin.map((el, i) => <StopRow key={`m${el.id}`} el={el} prise={priseAllerBy.get(el.id)} exc={matinExcMap.get(el.id)} current={i === curMatinIdx} index={i} />)}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#EEF4FB" }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: "#fff", border: `1px solid ${C.gray200}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <School size={14} color={C.navy} />
        </div>
        <div style={{ minWidth: 44, fontSize: 12.5, fontWeight: 800, color: C.navy }}>{ARRIVEE}</div>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 13, color: C.navy }}>Fondation Mérine</div>
      </div>
      <SectionHead label="🌙 Après-midi — dépose" />
      {aprem.length === 0
        ? <Empty text="Aucune dépose." />
        : aprem.map((el, i) => <StopRow key={`a${el.id}`} el={el} prise={priseRetourBy.get(el.id)} exc={apremExcMap.get(el.id)} current={i === curApremIdx} index={i} />)}
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  return <div style={{ padding: "8px 14px", fontSize: 11, fontWeight: 800, color: C.gray600, background: "#F8FAFC", textTransform: "uppercase", letterSpacing: ".4px" }}>{label}</div>;
}
function Empty({ text }: { text: string }) {
  return <div style={{ padding: "12px 14px", fontSize: 12.5, color: C.gray }}>{text}</div>;
}

function StopRow({ el, prise, exc, current, index }:
  { el: Eleve; prise?: PriseEnCharge; exc?: string; current: boolean; index: number }) {
  const info = exc ? EXC_INFO[exc] : null;
  if (info) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: `1px solid ${C.gray100}`, background: info.bg }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", background: info.color }}>⤳</div>
        <div style={{ minWidth: 44, fontSize: 12.5, fontWeight: 800, color: info.color, textDecoration: "line-through", opacity: .7 }}>{el.heure_ramassage || "—"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: info.color }}>{el.prenom_initiale} {el.nom_famille}</div>
          <div style={{ fontSize: 11.5, color: info.color, fontWeight: 600 }}>{info.label}</div>
        </div>
      </div>
    );
  }
  const done = !!prise;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: `1px solid ${C.gray100}`,
      opacity: done ? .6 : 1, background: current ? "#F8FBFF" : "#fff" }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, color: "#fff", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
        background: done ? (prise?.statut === "present" ? C.green : C.red) : current ? C.navy : "#c3ccd8" }}>
        {done ? (prise?.statut === "present" ? "✓" : "✗") : index + 1}
      </div>
      <div style={{ minWidth: 44, fontSize: 12.5, fontWeight: 800, color: C.navy }}>{el.heure_ramassage || "—"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1E293B" }}>{el.prenom_initiale} {el.nom_famille}</div>
        {el.adresse && <div style={{ fontSize: 11, color: C.gray, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{el.adresse}</div>}
      </div>
    </div>
  );
}
