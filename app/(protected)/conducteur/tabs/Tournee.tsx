"use client";
import { useEffect, useRef, useState } from "react";
import { Navigation, Phone, CheckCircle2, XCircle, School } from "lucide-react";
import { C } from "@/lib/constants";
import { circuitImage } from "@/lib/circuit-images";
import type { Conducteur, Eleve, PriseEnCharge } from "@/lib/types";

type CircType = { nom?: string; emoji?: string; id?: string };

// École de destination (Fondation Mérine). Fallback tant que les écoles
// n'ont pas de coordonnées propres en base.
const ECOLE_MERINE = { nom: "Fondation Mérine", lat: 46.6692349, lon: 6.7932469 };

interface TourneeProps {
  driver: Conducteur;
  circ?: CircType;
  eleves: Eleve[];
  prises: PriseEnCharge[];
  enService: boolean;
  onMarquerEleve: (eleveId: number, statut: "present" | "absent") => Promise<void>;
}

const gmaps = (la: number, lo: number) => `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}`;
const gmapsAddr = (adr: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adr)}`;
const cleanTel = (t?: string) => (t || "").replace(/\s/g, "");

// Charge Leaflet (CSS + JS) une seule fois côté client.
function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.L) return resolve(w.L);
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.id = "leaflet-js";
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function TabTournee({ driver, circ, eleves, prises, enService, onMarquerEleve }: TourneeProps) {
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [mapError, setMapError] = useState(false);

  const tournee = [...eleves].sort((a, b) =>
    (a.heure_ramassage || "~~").localeCompare(b.heure_ramassage || "~~"));
  const withCoords = tournee.filter(e => e.lat != null && e.lon != null);
  const prisByEleve = new Map(prises.map(p => [p.eleve_id, p]));
  const img = circuitImage(driver.circuit_id);

  useEffect(() => {
    let cancelled = false;
    if (!mapDiv.current || withCoords.length === 0) return;
    loadLeaflet().then((L) => {
      if (cancelled || !mapDiv.current) return;
      try {
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        const map = L.map(mapDiv.current, { zoomControl: false, attributionControl: false });
        mapRef.current = map;
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);
        const pts: [number, number][] = [];
        withCoords.forEach((e, k) => {
          const done = prisByEleve.get(e.id)?.statut === "present";
          const col = done ? "#0E9F6E" : "#0D3B7A";
          L.marker([e.lat as number, e.lon as number], {
            icon: L.divIcon({
              className: "", iconSize: [26, 26], iconAnchor: [13, 13],
              html: `<div style="background:${col};color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${k + 1}</div>`,
            }),
          }).addTo(map).bindPopup(`<b>${e.prenom_initiale} ${e.nom_famille}</b><br>${e.adresse || ""}`);
          pts.push([e.lat as number, e.lon as number]);
        });
        L.polyline([...pts, [ECOLE_MERINE.lat, ECOLE_MERINE.lon]], { color: "#0D3B7A", weight: 3, opacity: .45, dashArray: "6,6" }).addTo(map);
        L.marker([ECOLE_MERINE.lat, ECOLE_MERINE.lon], {
          icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14],
            html: `<div style="background:#fff;border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:15px;border:2px solid #0D3B7A;box-shadow:0 1px 4px rgba(0,0,0,.3)">🏫</div>` }),
        }).addTo(map);
        pts.push([ECOLE_MERINE.lat, ECOLE_MERINE.lon]);
        map.fitBounds(pts, { padding: [30, 30] });
        setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 200);
      } catch {
        setMapError(true);
      }
    }).catch(() => setMapError(true));
    return () => { cancelled = true; if (mapRef.current) { try { mapRef.current.remove(); } catch { /* noop */ } mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.circuit_id, eleves.length, prises.length]);

  const presents = prises.filter(p => p.statut === "present").length;

  return (
    <div>
      {/* En-tête circuit avec panneau */}
      <div style={{ background: "linear-gradient(160deg,#12498f,#0D3B7A)", borderRadius: 18, padding: "16px 18px",
        color: "#fff", marginBottom: 14, display: "flex", alignItems: "center", gap: 14 }}>
        {img
          ? <img src={img} alt={circ?.nom || ""} style={{ width: 54, height: 54, objectFit: "contain", flexShrink: 0 }} />
          : <div style={{ fontSize: 40 }}>{circ?.emoji || "🚌"}</div>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, opacity: .85, fontWeight: 600 }}>Ma tournée du jour</div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-.3px" }}>{circ?.nom || "Circuit"}</div>
          <div style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>
            {tournee.length} élève{tournee.length > 1 ? "s" : ""} · arrivée Mérine ~08:25
          </div>
        </div>
      </div>

      {/* Carte */}
      {withCoords.length > 0 && !mapError && (
        <div ref={mapDiv} style={{ height: 220, borderRadius: 16, overflow: "hidden",
          border: `1px solid ${C.gray200}`, marginBottom: 14, background: "#dce6f2" }} />
      )}
      {mapError && (
        <div style={{ height: 80, borderRadius: 16, border: `1px solid ${C.gray200}`, marginBottom: 14,
          display: "flex", alignItems: "center", justifyContent: "center", color: C.gray, fontSize: 13, background: "#f8fafc" }}>
          Carte indisponible (connexion) — les itinéraires restent accessibles ci-dessous.
        </div>
      )}

      {/* Progression */}
      {enService && tournee.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, height: 7, background: C.gray200, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round(presents / tournee.length * 100)}%`,
              background: C.green, borderRadius: 99, transition: "width .3s" }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.green }}>{presents}/{tournee.length}</span>
        </div>
      )}

      {/* Liste des arrêts */}
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {tournee.map((el, i) => {
          const prise = prisByEleve.get(el.id);
          return (
            <div key={el.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
              borderBottom: i < tournee.length - 1 ? `1px solid ${C.gray100}` : "none" }}>
              <div style={{ minWidth: 26, height: 26, borderRadius: 8, background: prise?.statut === "present" ? C.green : C.navy,
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                {prise?.statut === "present" ? "✓" : i + 1}
              </div>
              <div style={{ minWidth: 42 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: C.navy }}>{el.heure_ramassage || "—"}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1E293B" }}>{el.prenom_initiale} {el.nom_famille}</div>
                {el.adresse && (
                  <div style={{ fontSize: 11, color: C.gray, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{el.adresse}</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {/* Navigation TOUJOURS basée sur l'adresse exacte (source fiable),
                    jamais sur des coordonnées approximatives. */}
                {el.adresse ? (
                  <a href={gmapsAddr(el.adresse)} target="_blank" rel="noreferrer" title="Itinéraire"
                    style={{ width: 32, height: 32, borderRadius: 9, background: "#EFF6FF", color: C.navy, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                    <Navigation size={15} />
                  </a>
                ) : (el.lat != null && el.lon != null) ? (
                  <a href={gmaps(el.lat as number, el.lon as number)} target="_blank" rel="noreferrer" title="Itinéraire"
                    style={{ width: 32, height: 32, borderRadius: 9, background: "#EFF6FF", color: C.navy, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                    <Navigation size={15} />
                  </a>
                ) : null}
                {(el.tel_mere || el.tel_pere) && (
                  <a href={`tel:${cleanTel(el.tel_mere || el.tel_pere)}`} title="Appeler le parent"
                    style={{ width: 32, height: 32, borderRadius: 9, background: C.greenL, color: C.greenD, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                    <Phone size={15} />
                  </a>
                )}
              </div>
              {/* Présent / absent (uniquement en service) */}
              {enService && (
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  {prise ? (
                    <span style={{ color: prise.statut === "present" ? C.green : C.red, display: "flex", alignItems: "center" }}>
                      {prise.statut === "present" ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                    </span>
                  ) : (
                    <>
                      <button onClick={() => onMarquerEleve(el.id, "present")} title="Présent"
                        style={{ width: 32, height: 32, borderRadius: 9, border: "none", background: C.green, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CheckCircle2 size={16} />
                      </button>
                      <button onClick={() => onMarquerEleve(el.id, "absent")} title="Absent"
                        style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.red}`, background: "#fff", color: C.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <XCircle size={16} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {/* Arrivée école */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#F8FAFC" }}>
          <div style={{ minWidth: 26, height: 26, borderRadius: 8, background: "#fff", border: `1px solid ${C.gray200}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <School size={14} color={C.navy} />
          </div>
          <div style={{ minWidth: 42, fontWeight: 800, fontSize: 13, color: C.navy }}>08:25</div>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "#1E293B" }}>Fondation Mérine — dépose</div>
        </div>
      </div>
    </div>
  );
}
