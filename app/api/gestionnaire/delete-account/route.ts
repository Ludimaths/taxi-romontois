import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["gestionnaire", "admin"]);
  if ("guard" in auth) return auth.guard;

  try {
    const { conducteurId } = await req.json();
    if (!conducteurId) {
      return NextResponse.json({ error: "conducteurId requis" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1) Comptes de connexion liés (profil → auth.users) : suppression
    const { data: profs } = await supabase.from("profiles").select("id").eq("conducteur_id", conducteurId);
    for (const p of profs ?? []) {
      await supabase.auth.admin.deleteUser(p.id).catch(() => { /* déjà supprimé */ });
      await supabase.from("profiles").delete().eq("id", p.id);
    }

    // 2) Détacher / nettoyer les rattachements avant de retirer la fiche
    await supabase.from("circuits").update({ conducteur_id: null }).eq("conducteur_id", conducteurId);
    await supabase.from("vehicules").update({ conducteur_id: null }).eq("conducteur_id", conducteurId);
    await supabase.from("prises_en_charge").delete().eq("conducteur_id", conducteurId);
    await supabase.from("service_logs").delete().eq("conducteur_id", conducteurId);
    await supabase.from("absences_conducteurs").delete().eq("conducteur_id", conducteurId);
    await supabase.from("conges_demandes").delete().eq("conducteur_id", conducteurId);

    // 3) Fiche conducteur
    const { error: condErr } = await supabase.from("conducteurs").delete().eq("id", conducteurId);
    if (condErr) {
      return NextResponse.json({ error: `Suppression fiche : ${condErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[delete-account]", msg);
    return NextResponse.json({ error: "Erreur serveur inattendue." }, { status: 500 });
  }
}
