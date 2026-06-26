import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

const CALLBACK_URL = "https://taxi-romontois.onrender.com/auth/callback";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["gestionnaire", "admin"]);
  if ("guard" in auth) return auth.guard;

  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId requis" }, { status: 400 });

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Récupérer l'email depuis Auth
    const { data: userData, error: fetchErr } = await supabase.auth.admin.getUserById(userId);
    if (fetchErr || !userData?.user?.email) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const email = userData.user.email;

    // Renvoyer une invitation (ré-invite même si compte existant)
    const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: CALLBACK_URL,
    });
    if (inviteErr) {
      return NextResponse.json({ error: inviteErr.message }, { status: 500 });
    }

    // Forcer changement de mot de passe à la prochaine connexion
    await supabase.from("profiles").update({ must_change_password: true }).eq("id", userId);

    console.log("[set-password] invitation renvoyée:", email);
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    console.error("[set-password] exception:", e);
    return NextResponse.json({ error: "Erreur serveur inattendue" }, { status: 500 });
  }
}
