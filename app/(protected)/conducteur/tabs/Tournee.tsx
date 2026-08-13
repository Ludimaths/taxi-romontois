"use client";
import { useEffect, useRef, useState } from "react";
import { Navigation, School, ArrowRight } from "lucide-react";
import { C } from "@/lib/constants";
import { circuitImage } from "@/lib/circuit-images";
import type { Conducteur, Eleve, PriseEnCharge } from "@/lib/types";

type CircType = { nom?: string; emoji?: string; id?: string };

// Destination (Fondation Mérine) — fallback tant que les écoles n'ont pas
// leurs propres coordonnées en base.
const ECOLE = { nom: "Fondation Mérine", adr: "Rue du Château 47, 1510 Moudon", lat: 46.6692349, lon: 6.7932469, tel: "021 905 30 30" };
const CENTRAL_TEL = "024 455 44 80";
const ARRIVEE = "08:25";

export interface ExcToday { eleve_id: number; type: "absent" | "parent" | "changement_circuit"; }

interface TourneeProps {
  driver: Conducteur;
  circ?: CircType;
  eleves: Eleve[];
  prises: PriseEnCharge[];
  exceptions?: ExcToday[];
  sens?: "matin" | "aprem";
  enService: boolean;
  serviceFini?: boolean;
  onMarquerEleve: (eleveId: number, statut: "present" | "absent") => Promise<void>;
  onValiderMatin?: () => void;
  onShowConfirm: () => void;
  onShowFin: () => void;
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

export function TabTournee({ driver, circ, eleves, prises, exceptions = [], sens = "matin", enService, serviceFini = false, onMarquerEleve, onValiderMatin, onShowConfirm, onShowFin, onShowReprise }: TourneeProps) {
  const isAprem = sens === "aprem";
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mapError, setMapError] = useState(false);
  const [arrived, setArrived] = useState(false);          // arrivé sur place à l'arrêt courant
  const [schoolPhase, setSchoolPhase] = useState<"go" | "at" | "done">("go");

  const excMap = new Map<number, string>(exceptions.map(x => [x.eleve_id, x.type]));   // exceptions du jour
  const hasExc = (e: Eleve) => excMap.has(e.id);
  const tournee = [...eleves].sort((a, b) => (a.heure_ramassage || "~~").localeCompare(b.heure_ramassage || "~~"));
  const prisByEleve = new Map(prises.map(p => [p.eleve_id, p]));
  // Un enfant absent / ramené par les parents / sur un autre circuit n'est PAS un arrêt :
  // il compte comme "réglé" pour la progression, on passe au suivant.
  const isDone = (e: Eleve) => prisByEleve.has(e.id) || hasExc(e);
  const currentIndex = tournee.findIndex(e => !isDone(e));
  const active = tournee.filter(e => !hasExc(e));                       // à réellement récupérer
  const allPickedUp = tournee.length > 0 && currentIndex === -1;
  const presents = prises.filter(p => p.statut === "present").length;
  const img = circuitImage(driver.circuit_id);
  const withCoords = tournee.filter(e => e.lat != null && e.lon != null);

  // Carte (visible en service)
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
        tournee.forEach((e, k) => {
          if (e.lat == null || e.lon == null) return;
          const done = isDone(e);
          const cur = k === currentIndex;
          const col = done ? "#0E9F6E" : cur ? "#E02424" : "#0D3B7A";
          L.marker([e.lat, e.lon], { icon: L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 13],
            html: `<div style="background:${col};color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${done ? "✓" : k + 1}</div>` }) })
            .addTo(map).bindPopup(`<b>${e.prenom_initiale} ${e.nom_famille}</b><br>${e.adresse || ""}`);
          pts.push([e.lat, e.lon]);
        });
        L.polyline([...pts, [ECOLE.lat, ECOLE.lon]], { color: "#0D3B7A", weight: 3, opacity: .45, dashArray: "6,6" }).addTo(map);
        L.marker([ECOLE.lat, ECOLE.lon], { icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14],
          html: `<div style="background:#fff;border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:15px;border:2px solid #0D3B7A;box-shadow:0 1px 4px rgba(0,0,0,.3)">🏫</div>` }) }).addTo(map);
        pts.push([ECOLE.lat, ECOLE.lon]);
        map.fitBounds(pts, { padding: [30, 30] });
        setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 200);
      } catch { setMapError(true); }
    }).catch(() => setMapError(true));
    return () => { cancelled = true; if (mapRef.current) { try { mapRef.current.remove(); } catch { /* noop */ } mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enService, driver.circuit_id, eleves.length, prises.length, currentIndex]);

  // ── En-tête (étiquette de présentation) ────────────────────────────────────
  const header = (
    <div style={{ background: "linear-gradient(160deg,#12498f,#0D3B7A)", borderRadius: 20, padding: "18px 20px",
      color: "#fff", marginBottom: 14, display: "flex", alignItems: "center", gap: 16, boxShadow: "0 6px 20px rgba(13,59,122,.25)" }}>
      {img
        ? <div style={{ width: 84, height: 84, borderRadius: 18, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
            <img src={img} alt={circ?.nom || ""} style={{ width: 72, height: 72, objectFit: "contain" }} />
          </div>
        : <div style={{ fontSize: 56 }}>{circ?.emoji || "🚌"}</div>}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, opacity: .85, fontWeight: 600, letterSpacing: ".3px", textTransform: "uppercase" }}>{isAprem ? "Ma tournée de l'après-midi" : "Ma tournée du matin"}</div>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-.4px", marginTop: 1 }}>{circ?.nom || "Circuit"}</div>
        <div style={{ fontSize: 12.5, opacity: .85, marginTop: 3 }}>
          {isAprem
            ? <>{active.length} dépose{active.length > 1 ? "s" : ""} · départ Mérine</>
            : <>{active.length} élève{active.length > 1 ? "s" : ""} · arrivée Mérine ~{ARRIVEE}</>}
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

  const contacts = (e: Eleve) => (
    <div style={{ display: "flex", gap: 7, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.gray100}`, flexWrap: "wrap" }}>
      {e.tel_mere && <a href={`tel:${cleanTel(e.tel_mere)}`} style={cbtn("p")}>📞 Mère</a>}
      {e.tel_pere && <a href={`tel:${cleanTel(e.tel_pere)}`} style={cbtn("p")}>📞 Père</a>}
      <a href={`tel:${cleanTel(ECOLE.tel)}`} style={cbtn("s")}>🏫 École</a>
      <a href={`tel:${cleanTel(CENTRAL_TEL)}`} style={cbtn()}>🏢 Central</a>
    </div>
  );
  function cbtn(kind?: "p" | "s"): React.CSSProperties {
    return { flex: 1, minWidth: "calc(50% - 4px)", textAlign: "center", textDecoration: "none", fontSize: 12.5, fontWeight: 700,
      padding: "10px 8px", borderRadius: 11, border: `1px solid ${C.gray200}`,
      color: kind === "p" ? "#b42323" : C.navy, background: kind === "p" ? "#FDECEC" : kind === "s" ? "#EFF6FF" : "#fff" };
  }

  // ── 0bis) Aucun circuit attribué → message d'attente (avant tout le reste) ──
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

  // ── 0) Service déjà terminé aujourd'hui → FÉLICITATIONS ─────────────────────
  if (!enService && serviceFini && driver.status !== "absent") {
    return (
      <div>
        {header}
        <div style={{ textAlign: "center", padding: "26px 16px" }}>
          <div style={{ width: 88, height: 88, borderRadius: "50%", background: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 44 }}>🎉</div>
          <div style={{ color: C.green, fontSize: 22, fontWeight: 900 }}>Service terminé — félicitations !</div>
          <p style={{ color: "#475569", fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
            Vous avez assuré votre tournée. Merci et bon repos.<br />Rendez-vous à la prochaine tournée.
          </p>
        </div>
        <StopList tournee={tournee} prisByEleve={prisByEleve} currentIndex={-1} excMap={excMap} />
      </div>
    );
  }

  // ── 1) Pas encore en service → BRIEFING ─────────────────────────────────────
  if (!enService) {
    const first = tournee[0];
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
              <div style={{ fontSize: 18, fontWeight: 900, color: C.navy, marginBottom: 6 }}>Voici votre tournée</div>
              <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
                Vous récupérez <b>{tournee.length} enfant{tournee.length > 1 ? "s" : ""}</b> et les déposez à la <b>Fondation Mérine</b> pour <b>{ARRIVEE}</b>.
                {first?.heure_ramassage ? <> Premier ramassage à <b>{first.heure_ramassage}</b>.</> : null}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                {[["Enfants", String(tournee.length)], ["Premier", first?.heure_ramassage || "—"], ["Arrivée école", ARRIVEE], ["Véhicule", (driver.vehicule_id as string) || "—"]].map(([l, v]) => (
                  <div key={l} style={{ background: "#F8FAFC", border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: C.navy }}>{v}</div>
                    <div style={{ fontSize: 11.5, color: C.gray, marginTop: 1 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
            {bigBtn("Démarrer la tournée", onShowConfirm, "ok")}
          </>
        )}
        {/* Aperçu liste */}
        <StopList tournee={tournee} prisByEleve={prisByEleve} currentIndex={-1} excMap={excMap} />
      </div>
    );
  }

  // ── 2) Tous les arrêts faits ────────────────────────────────────────────────
  if (allPickedUp) {
    // APRÈS-MIDI : toutes les déposes sont faites → fin de service
    if (isAprem) {
      return (
        <div>
          {header}
          <div style={{ textAlign: "center", padding: "22px 16px" }}>
            <div style={{ width: 84, height: 84, borderRadius: "50%", background: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 42 }}>🎉</div>
            <div style={{ color: C.green, fontSize: 22, fontWeight: 900 }}>Tournée de l&apos;après-midi terminée !</div>
            <p style={{ color: "#475569", fontSize: 14, marginTop: 6 }}>Tous les enfants ont été déposés. Bonne fin de journée.</p>
          </div>
          {bigBtn("Je termine mon service", onShowFin, "navy")}
          <StopList tournee={tournee} prisByEleve={prisByEleve} currentIndex={-1} excMap={excMap} isAprem />
        </div>
      );
    }
    // MATIN : dépose à l'école puis validation → après-midi
    if (schoolPhase === "done") {
      return (
        <div>
          {header}
          <div style={{ textAlign: "center", padding: "22px 16px" }}>
            <div style={{ width: 84, height: 84, borderRadius: "50%", background: C.greenL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 42 }}>🎉</div>
            <div style={{ color: C.green, fontSize: 22, fontWeight: 900 }}>Tournée du matin terminée !</div>
            <p style={{ color: "#475569", fontSize: 14, marginTop: 6 }}>Les {active.length} enfants sont arrivés à Mérine. Prochaine étape : la tournée de l&apos;après-midi.</p>
          </div>
          {bigBtn("Valider — passer à l'après-midi", () => onValiderMatin?.(), "ok")}
        </div>
      );
    }
    return (
      <div>
        {header}
        {!mapError && withCoords.length > 0 && <div ref={mapDiv} style={{ height: 200, borderRadius: 16, overflow: "hidden", border: `1px solid ${C.gray200}`, marginBottom: 14, background: "#dce6f2" }} />}
        <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.navy, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>🏫 Destination finale</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#1E293B" }}>{ECOLE.nom}</div>
          <div style={{ fontSize: 13, color: C.gray, marginTop: 2 }}>{ECOLE.adr}</div>
          <div style={{ marginTop: 14 }}>
            {schoolPhase === "go" ? (<>
              {navBtn(gmapsLL(ECOLE.lat, ECOLE.lon), "Itinéraire vers l'école")}
              {bigBtn("Arrivé à l'école", () => setSchoolPhase("at"))}
            </>) : (
              bigBtn(`Déposer les ${active.length} enfants`, () => setSchoolPhase("done"), "ok")
            )}
          </div>
        </div>
        <StopList tournee={tournee} prisByEleve={prisByEleve} currentIndex={-1} excMap={excMap} />
      </div>
    );
  }

  // ── 3) En service, arrêt courant ────────────────────────────────────────────
  const cur = tournee[currentIndex];
  return (
    <div>
      {header}
      {!mapError && withCoords.length > 0 && <div ref={mapDiv} style={{ height: 200, borderRadius: 16, overflow: "hidden", border: `1px solid ${C.gray200}`, marginBottom: 12, background: "#dce6f2" }} />}
      {/* Progression */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#475569" }}>{isAprem ? "À déposer" : "À récupérer"}</span>
        <div style={{ flex: 1, height: 7, background: C.gray200, borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round(presents / (active.length || 1) * 100)}%`, background: C.green, borderRadius: 99, transition: "width .3s" }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.green }}>{presents}/{active.length}</span>
      </div>
      {/* Carte arrêt courant */}
      {cur && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: arrived ? C.amber : C.navy, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
            {isAprem
              ? (arrived ? "📍 Sur place — déposez l'enfant" : "🏠 Prochaine dépose")
              : (arrived ? "📍 Sur place — récupérez l'enfant" : currentIndex === 0 ? "🚸 Premier enfant à récupérer" : "🚸 Prochain enfant")}
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
            </>) : isAprem ? (
              bigBtn(`✓ ${cur.prenom_initiale} est déposé(e)`, async () => { await onMarquerEleve(cur.id, "present"); setArrived(false); }, "ok")
            ) : (<>
              {bigBtn(`✓ ${cur.prenom_initiale} est monté(e)`, async () => { await onMarquerEleve(cur.id, "present"); setArrived(false); }, "ok")}
              <button onClick={async () => { await onMarquerEleve(cur.id, "absent"); setArrived(false); }}
                style={{ width: "100%", padding: "13px", borderRadius: 14, border: "1.5px solid #f3d0d0", background: "#fff", color: "#b42323", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                Absent aujourd'hui
              </button>
            </>)}
          </div>
          {contacts(cur)}
        </div>
      )}
      <StopList tournee={tournee} prisByEleve={prisByEleve} currentIndex={currentIndex} excMap={excMap} isAprem={isAprem} />
    </div>
  );
}

// ── Liste des arrêts (fait / courant / à venir / exception) ───────────────────
function StopList({ tournee, prisByEleve, currentIndex, excMap, isAprem = false }: { tournee: Eleve[]; prisByEleve: Map<number, PriseEnCharge>; currentIndex: number; excMap: Map<number, string>; isAprem?: boolean }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)", overflow: "hidden", marginTop: 4 }}>
      {tournee.map((el, i) => {
        const exc = excMap.get(el.id);
        const info = exc ? EXC_INFO[exc] : null;
        const prise = prisByEleve.get(el.id);
        const done = !!prise;
        const cur = i === currentIndex;
        if (info) {
          return (
            <div key={el.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
              borderBottom: i < tournee.length - 1 ? `1px solid ${C.gray100}` : "none", background: info.bg }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, color: "#fff", fontWeight: 800, fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center", background: info.color }}>⤳</div>
              <div style={{ minWidth: 40, fontSize: 12.5, fontWeight: 800, color: info.color, textDecoration: "line-through", opacity: .7 }}>{el.heure_ramassage || "—"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5, color: info.color }}>{el.prenom_initiale} {el.nom_famille}</div>
                <div style={{ fontSize: 11.5, color: info.color, fontWeight: 600 }}>{info.label}</div>
              </div>
            </div>
          );
        }
        return (
          <div key={el.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
            borderBottom: i < tournee.length - 1 ? `1px solid ${C.gray100}` : "none",
            opacity: done ? .6 : cur ? 1 : currentIndex >= 0 && i > currentIndex ? .5 : 1,
            background: cur ? "#F8FBFF" : "#fff" }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, color: "#fff", fontWeight: 800, fontSize: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: done ? (prise?.statut === "present" ? C.green : C.red) : cur ? C.navy : "#c3ccd8" }}>
              {done ? (prise?.statut === "present" ? "✓" : "✗") : i + 1}
            </div>
            <div style={{ minWidth: 40, fontSize: 12.5, fontWeight: 800, color: C.navy }}>{el.heure_ramassage || "—"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1E293B" }}>
                {el.prenom_initiale} {el.nom_famille}
                {!el.heure_ramassage && <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, background: C.amberL, borderRadius: 6, padding: "1px 6px", marginLeft: 6 }}>amené par les parents</span>}
              </div>
              {el.adresse && <div style={{ fontSize: 11, color: C.gray, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{el.adresse}</div>}
            </div>
          </div>
        );
      })}
      {!isAprem && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "#F8FAFC" }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: "#fff", border: `1px solid ${C.gray200}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <School size={14} color={C.navy} />
          </div>
          <div style={{ minWidth: 40, fontSize: 12.5, fontWeight: 800, color: C.navy }}>{ARRIVEE}</div>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 13.5, color: "#1E293B" }}>Fondation Mérine — dépose <ArrowRight size={12} style={{ verticalAlign: "middle" }} /></div>
        </div>
      )}
    </div>
  );
}
