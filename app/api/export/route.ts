import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const BOM = "﻿";
  const escape = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers, ...rows].map(row => row.map(escape).join(";"));
  return BOM + lines.join("\r\n");
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(["gestionnaire", "admin", "mecanicien"]);
  if ("guard" in auth) return auth.guard;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "conducteurs";
  const supabase = await createServiceClient();

  let csv = "";
  let filename = `TaxiRomontois_${type}.csv`;

  if (type === "conducteurs") {
    const { data } = await supabase.from("conducteurs")
      .select("*, cercle:cercles_scolaires(*), circuit:circuits(*), vehicule:vehicules(*)")
      .order("nom");
    const headers = ["Nom", "Prénom", "Téléphone", "Affectation", "Cercle scolaire", "Circuit", "Véhicule", "Permis", "Validité permis", "Statut", "Tachygraphe"];
    const rows = (data ?? []).map((d: any) => [
      d.nom, d.prenom, d.tel ?? "", d.affectation,
      d.cercle?.nom ?? "", d.circuit ? `${d.circuit.num}-${d.circuit.nom}` : "",
      d.vehicule?.plaque ?? "", d.permis ?? "",
      d.permis_exp ? new Date(d.permis_exp).toLocaleDateString("fr-FR") : "",
      d.status, d.tachygraphe ? "Oui" : "Non",
    ]);
    csv = toCSV(headers, rows);
  } else if (type === "vehicules") {
    const { data } = await supabase.from("vehicules")
      .select("*, circuit:circuits(*), conducteur:conducteurs(*)")
      .order("plaque");
    const headers = ["Plaque", "Marque", "Modèle", "Places", "Places handicap", "Kilométrage", "État", "Conducteur", "Circuit", "CT", "Assurance"];
    const rows = (data ?? []).map((v: any) => [
      v.plaque, v.marque, v.modele, v.places, v.places_handi, v.km,
      v.etat, v.conducteur ? `${v.conducteur.prenom} ${v.conducteur.nom}` : "",
      v.circuit ? `${v.circuit.num}-${v.circuit.nom}` : "",
      v.ct_date ?? "", v.assurance_date ?? "",
    ]);
    csv = toCSV(headers, rows);
  } else if (type === "enfants") {
    const { data } = await supabase.from("enfants")
      .select("*, circuit:circuits(*)")
      .order("nom");
    const headers = ["Nom", "Prénom", "Circuit", "École", "Parent", "Téléphone", "Adresse mère", "Adresse père"];
    const rows = (data ?? []).map((e: any) => [
      e.nom, e.prenom, e.circuit ? `${e.circuit.num}-${e.circuit.nom}` : "",
      e.circuit?.cercle?.nom ?? "", e.parent_nom ?? "", e.parent_tel ?? "",
      e.adresse_mere ?? "", e.adresse_pere ?? "",
    ]);
    csv = toCSV(headers, rows);
  } else if (type === "circuits") {
    const { data } = await supabase.from("circuits").select("*, cercle:cercles_scolaires(*)").order("num");
    const headers = ["Numéro", "Nom", "Emoji", "Cercle scolaire", "Nb enfants", "Km"];
    const rows = (data ?? []).map((c: any) => [c.num, c.nom, c.emoji, c.cercle?.nom ?? "", c.enfants_count, c.km_aller ?? ""]);
    csv = toCSV(headers, rows);
  } else if (type === "incidents") {
    const { data } = await supabase.from("incidents")
      .select("*, vehicule:vehicules(*), conducteur:conducteurs(*), circuit:circuits(*)")
      .order("reported_at", { ascending: false });
    const headers = ["Date", "Type", "Véhicule", "Conducteur", "Circuit", "Description", "Statut", "Réponse"];
    const rows = (data ?? []).map((i: any) => [
      new Date(i.reported_at).toLocaleDateString("fr-FR"),
      i.type, i.vehicule?.plaque ?? "", `${i.conducteur?.prenom ?? ""} ${i.conducteur?.nom ?? ""}`,
      i.circuit?.nom ?? "", i.description, i.status, i.response ?? "",
    ]);
    csv = toCSV(headers, rows);
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
