import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["gestionnaire", "admin"]);
  if ("guard" in auth) return auth.guard;

  const supabase = await createServiceClient();
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const type = formData.get("type") as string;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const text = await file.text();
  // Remove BOM if present
  const content = text.replace(/^﻿/, "");
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return NextResponse.json({ error: "Empty file" }, { status: 400 });

  const sep = lines[0].includes(";") ? ";" : ",";
  const parseRow = (line: string) => line.split(sep).map(v => v.replace(/^"|"$/g, "").trim());

  const [, ...dataLines] = lines;
  let imported = 0;
  let errors: string[] = [];

  if (type === "conducteurs") {
    for (const line of dataLines) {
      if (!line.trim()) continue;
      const cols = parseRow(line);
      // Expected: Nom;Prénom;Téléphone;Affectation;Cercle;Circuit nom;Véhicule plaque;Permis;Validité permis
      const [nom, prenom, tel, affectation, cercleNom] = cols;
      if (!nom || !prenom) continue;

      let cercle_id = null;
      if (cercleNom) {
        const { data: cercle } = await supabase.from("cercles_scolaires").select("id").eq("nom", cercleNom).single();
        cercle_id = cercle?.id ?? null;
      }

      const photo_initials = `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();

      const { error } = await supabase.from("conducteurs").upsert({
        nom, prenom, tel: tel || null, affectation: affectation || "Scolaire",
        cercle_id, photo_initials, status: "disponible", tachygraphe: false,
      }, { onConflict: "nom,prenom", ignoreDuplicates: false });

      if (error) errors.push(`${prenom} ${nom}: ${error.message}`);
      else imported++;
    }
  } else if (type === "vehicules") {
    for (const line of dataLines) {
      if (!line.trim()) continue;
      const cols = parseRow(line);
      // Expected: Plaque;Marque;Modèle;Places;Places handicap;Kilométrage
      const [plaque, marque, modele, placesStr, handiStr, kmStr] = cols;
      if (!plaque || !marque) continue;

      const id = plaque.replace(/ /g, "-");
      const { error } = await supabase.from("vehicules").upsert({
        id, plaque, marque, modele: modele || "",
        places: parseInt(placesStr) || 0,
        places_handi: parseInt(handiStr) || 0,
        km: parseInt(kmStr) || 0,
        etat: "bon",
      }, { onConflict: "id", ignoreDuplicates: false });

      if (error) errors.push(`${plaque}: ${error.message}`);
      else imported++;
    }
  }

  return NextResponse.json({ imported, errors, total: dataLines.length });
}
