import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Route publique — utilise la clé service pour bypasser le RLS
// La page /scan est accessible sans authentification
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ vehicleId: string }> }
) {
  const { vehicleId: raw } = await params;
  const vehicleId = decodeURIComponent(raw);

  const sb = createAdminClient();
  const sel = "*, circuit:circuits(*,cercle:cercles_scolaires(*)), conducteur:conducteurs(*)";

  // Stratégie 1 : par id exact (ex: "FR-80058")
  let { data } = await sb.from("vehicules").select(sel).eq("id", vehicleId).maybeSingle();
  if (!data) {
    // Stratégie 2 : par plaque tirets → espaces (ex: "FR-80058" → "FR 80058")
    const withSpace = vehicleId.replace(/-/g, " ");
    ({ data } = await sb.from("vehicules").select(sel).eq("plaque", withSpace).maybeSingle());
  }
  if (!data) {
    // Stratégie 3 : par id avec espaces
    const withSpace = vehicleId.replace(/-/g, " ");
    ({ data } = await sb.from("vehicules").select(sel).eq("id", withSpace).maybeSingle());
  }

  if (!data) return NextResponse.json({ vehicle: null }, { status: 404 });
  return NextResponse.json({ vehicle: data });
}
