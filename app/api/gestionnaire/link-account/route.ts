import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

function buildEmail(prenom: string, nom: string): string {
  const clean = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, ".");
  return `${clean(prenom)}.${clean(nom)}@taxi-romontois.ch`;
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["gestionnaire", "admin"]);
  if ("guard" in auth) return auth.guard;

  try {
    const { conducteurId, prenom, nom, password } = await req.json();
    if (!conducteurId || !prenom || !nom) {
      return NextResponse.json({ error: "conducteurId, prenom et nom sont requis" }, { status: 400 });
    }

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const email = buildEmail(prenom, nom);
    console.log("[link-account] Recherche Auth user:", email);

    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) {
      return NextResponse.json({ error: `Impossible de lister les utilisateurs : ${listErr.message}` }, { status: 500 });
    }

    const authUser = listData.users.find((u) => u.email === email);
    if (!authUser) {
      return NextResponse.json(
        { error: `Aucun compte Auth trouvé pour ${email}. Créez d'abord le compte.` },
        { status: 404 }
      );
    }

    console.log("[link-account] Auth user trouvé:", authUser.id);

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id,conducteur_id")
      .eq("id", authUser.id)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.conducteur_id === conducteurId && !password) {
        return NextResponse.json({ ok: true, email, already: true });
      }
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ conducteur_id: conducteurId, nom, prenom, must_change_password: password ? true : undefined })
        .eq("id", authUser.id);
      if (updateErr) {
        return NextResponse.json({ error: `Erreur mise à jour profil : ${updateErr.message}` }, { status: 500 });
      }
    } else {
      const { error: insertErr } = await supabase.from("profiles").insert({
        id: authUser.id,
        role: "conducteur",
        conducteur_id: conducteurId,
        nom,
        prenom,
        must_change_password: password ? true : false,
      });
      if (insertErr) {
        return NextResponse.json({ error: `Erreur création profil : ${insertErr.message}` }, { status: 500 });
      }
    }

    if (password) {
      const { error: pwdErr } = await supabase.auth.admin.updateUserById(authUser.id, { password });
      if (pwdErr) {
        return NextResponse.json({ error: `Compte lié mais erreur mot de passe : ${pwdErr.message}` }, { status: 500 });
      }
    }

    console.log("[link-account] Succès:", email, "→ conducteur_id:", conducteurId);
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    console.error("[link-account] Exception:", e);
    return NextResponse.json({ error: "Erreur serveur inattendue" }, { status: 500 });
  }
}
