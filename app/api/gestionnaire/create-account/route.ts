import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

const CALLBACK_URL = "https://taxi-romontois.onrender.com/auth/callback";

function buildEmail(prenom: string, nom: string): string {
  const clean = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, ".");
  return `${clean(prenom)}.${clean(nom)}@taxi-romontois.ch`;
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["gestionnaire", "admin"]);
  if ("guard" in auth) return auth.guard;

  try {
    const { conducteurId, prenom, nom } = await req.json();

    if (!conducteurId || !prenom || !nom) {
      return NextResponse.json({ error: "conducteurId, prenom et nom sont requis" }, { status: 400 });
    }

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[create-account]", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const email = buildEmail(prenom, nom);
    console.log("[create-account] invitation pour:", email, "conducteur_id:", conducteurId);

    // Envoi invitation Supabase (crée le compte ou ré-invite si existant)
    const { data: authData, error: authErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: CALLBACK_URL,
    });

    if (authErr || !authData?.user) {
      console.error("[create-account] invite error:", authErr?.message);
      return NextResponse.json({ error: authErr?.message ?? "Erreur envoi invitation" }, { status: 500 });
    }

    const uid = authData.user.id;

    // Créer ou mettre à jour le profil
    const { data: existing } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
    if (existing) {
      await supabase.from("profiles").update({
        role: "conducteur", conducteur_id: conducteurId, nom, prenom, must_change_password: true,
      }).eq("id", uid);
    } else {
      const { error: profErr } = await supabase.from("profiles").insert({
        id: uid, role: "conducteur", conducteur_id: conducteurId, nom, prenom, must_change_password: true,
      });
      if (profErr) {
        console.error("[create-account] profile error:", profErr.message);
        return NextResponse.json({ error: `Erreur profil : ${profErr.message}` }, { status: 500 });
      }
    }

    console.log("[create-account] invitation envoyée:", email, "uid:", uid);
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    console.error("[create-account] exception:", e);
    return NextResponse.json({ error: "Erreur serveur inattendue" }, { status: 500 });
  }
}
