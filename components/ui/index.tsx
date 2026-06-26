"use client";
import { useState, ReactNode, CSSProperties } from "react";
import { C } from "@/lib/constants";

// ── Badge ──────────────────────────────────────────────────────────────────────
type BadgeColor = "green" | "red" | "blue" | "amber" | "gray" | "purple" | "navy";
const BADGE_STYLES: Record<BadgeColor, { bg: string; tx: string; bd: string }> = {
  green:  { bg: C.greenL,  tx: "#15803D", bd: "#86EFAC" },
  red:    { bg: C.redL,    tx: C.red,     bd: "#FCA5A5" },
  blue:   { bg: C.skyL,    tx: "#1D4ED8", bd: "#93C5FD" },
  amber:  { bg: C.amberL,  tx: "#92400E", bd: "#FDE68A" },
  gray:   { bg: C.gray100, tx: C.gray600, bd: C.gray200 },
  purple: { bg: C.purpleL, tx: "#5B21B6", bd: "#C4B5FD" },
  navy:   { bg: "#EEF2FF", tx: C.navy,    bd: "#C7D2FE" },
};
export function Badge({ color = "gray", children }: { color?: BadgeColor; children: ReactNode }) {
  const s = BADGE_STYLES[color];
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: s.bg, color: s.tx, border: `1px solid ${s.bd}` }}>
      {children}
    </span>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
export function Avatar({ initials, size = 36, color, photoUrl }:
  { initials: string; size?: number; color?: string; photoUrl?: string | null }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={photoUrl} alt={initials}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover",
          flexShrink: 0, display: "block" }} />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%",
      background: color || `linear-gradient(135deg,${C.navyL},${C.sky})`,
      color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.33, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, onClick }: { children: ReactNode; style?: CSSProperties; onClick?: () => void }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => onClick && setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`,
        boxShadow: h ? "0 6px 20px rgba(13,59,122,0.12)" : "0 1px 4px rgba(0,0,0,0.05)",
        cursor: onClick ? "pointer" : "default", transition: "box-shadow .15s", ...style }}>
      {children}
    </div>
  );
}

// ── InfoBox ────────────────────────────────────────────────────────────────────
export function InfoBox({ label, value, highlight, full }: { label: string; value?: string | number | null; highlight?: string; full?: boolean }) {
  return (
    <div style={{ background: C.gray50, borderRadius: 8, padding: "10px 14px", gridColumn: full ? "1/-1" : undefined }}>
      <div style={{ fontSize: 10, color: C.gray400, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 600, color: highlight || C.gray800, fontSize: 13 }}>{value ?? "—"}</div>
    </div>
  );
}

// ── Btn ────────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, color = C.navyL, disabled, full, outline, small }:
  { children: ReactNode; onClick?: () => void; color?: string; disabled?: boolean; full?: boolean; outline?: boolean; small?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: full ? "100%" : undefined,
      background: disabled ? C.gray200 : outline ? "transparent" : color,
      color: disabled ? C.gray400 : outline ? color : C.white,
      border: outline ? `2px solid ${color}` : "none",
      padding: small ? "6px 14px" : "11px 20px", borderRadius: 8, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer", fontSize: small ? 12 : 14,
      transition: "opacity .15s", opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(13,59,122,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Card style={{ width: "100%", maxWidth: wide ? 780 : 620, maxHeight: "88vh", overflowY: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.gray800 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: C.gray400, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </Card>
    </div>
  );
}

// ── SectionTitle ───────────────────────────────────────────────────────────────
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.gray800, margin: 0 }}>{title}</h2>
      {action && <Btn onClick={onAction} small>{action}</Btn>}
    </div>
  );
}

// ── TabBar ─────────────────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: "6px 16px", borderRadius: 8, border: `2px solid ${active === t ? C.navyL : C.gray200}`,
          background: active === t ? C.navyL : C.white, color: active === t ? C.white : C.gray600,
          fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ── Stat ───────────────────────────────────────────────────────────────────────
export function Stat({ label, value, sub, icon, color, onClick }:
  { label: string; value: number | string; sub?: string; icon: string; color: string; onClick?: () => void }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: C.white, borderRadius: 12, padding: "18px 22px",
        border: `2px solid ${h && onClick ? color + "80" : C.gray200}`,
        boxShadow: h && onClick ? "0 4px 16px rgba(0,0,0,0.1)" : "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex", alignItems: "center", gap: 14, cursor: onClick ? "pointer" : "default", transition: "all .15s" }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: color + "22",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: C.gray800, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: C.gray600, marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{sub}</div>}
      </div>
      {onClick && <div style={{ color, fontSize: 18, opacity: h ? 0.9 : 0.35, transition: "opacity .15s" }}>→</div>}
    </div>
  );
}

// ── BottomSheet ────────────────────────────────────────────────────────────────
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div style={{ width: "100%", maxHeight: "94vh", overflowY: "auto", background: C.white, borderRadius: "24px 24px 0 0", padding: "24px 20px 80px" }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: "#CBD5E1", borderRadius: 4, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.navy, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ fontSize: 28, background: "none", border: "none", cursor: "pointer", color: C.gray600, lineHeight: 1, padding: "0 4px", minWidth: 44, minHeight: 44 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── BigButton ──────────────────────────────────────────────────────────────────
export function BigButton({ icon, label, onClick, color = C.navy, outline = false, disabled = false }: {
  icon?: string; label: string; onClick: () => void;
  color?: string; outline?: boolean; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "16px 20px", marginBottom: 10, borderRadius: 16,
      fontWeight: 800, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer",
      border: outline ? `2px solid ${color}` : "none",
      background: outline ? C.white : disabled ? "#CBD5E1" : color,
      color: outline ? color : C.white,
      opacity: disabled ? 0.6 : 1,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52,
    }}>
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}{label}
    </button>
  );
}

// ── FormField ──────────────────────────────────────────────────────────────────
const fieldInp: CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 12,
  border: "1.5px solid #CBD5E1", fontSize: 15, color: C.gray800,
  background: C.white, boxSizing: "border-box",
};
export function FormField({ label, type = "text", value, onChange, placeholder = "", required = false }: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 6 }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={fieldInp} />
    </div>
  );
}

// ── TextAreaField ──────────────────────────────────────────────────────────────
export function TextAreaField({ label, value, onChange, rows = 3, placeholder = "" }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.gray600, marginBottom: 6 }}>{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        style={{ ...fieldInp, resize: "vertical" } as CSSProperties} />
    </div>
  );
}

// ── DataRow ────────────────────────────────────────────────────────────────────
export function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.gray100}`, fontSize: 14 }}>
      <span style={{ color: C.gray600, fontWeight: 600 }}>{label}</span>
      <span style={{ color: C.gray800, fontWeight: 700, textAlign: "right", maxWidth: "65%" }}>{value}</span>
    </div>
  );
}
