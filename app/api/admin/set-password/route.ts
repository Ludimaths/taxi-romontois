import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["gestionnaire", "admin"]);
  if ("guard" in auth) return auth.guard;

  try {
    const { userId, password } = await req.json();
    if (!userId || !password) {
      return NextResponse.json({ error: "Params manquants" }, { status: 400 });
    }

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Forcer changement de mot de passe à la prochaine connexion
    await supabase.from("profiles").update({ must_change_password: true }).eq("id", userId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[set-password] exception:", e);
    return NextResponse.json({ error: "Erreur serveur inattendue" }, { status: 500 });
  }
}
