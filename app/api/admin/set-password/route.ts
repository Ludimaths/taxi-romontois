import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  const auth = await requireRole(["gestionnaire", "admin"]);
  if ("guard" in auth) return auth.guard;

  try {
    const { userId, password } = await req.json();

    if (!userId || !password) {
      return NextResponse.json({ error: "userId et password requis" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Mot de passe trop court (min 8 caractères)" }, { status: 400 });
    }

    let supabase;
    try {
      supabase = createAdminClient();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[set-password]", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Vérifier que l'utilisateur existe dans auth.users
    const { data: userData, error: fetchErr } = await supabase.auth.admin.getUserById(userId);
    if (fetchErr || !userData?.user) {
      console.error("[set-password] utilisateur introuvable:", fetchErr?.message);
      return NextResponse.json(
        { error: `Utilisateur introuvable dans Auth (${fetchErr?.message ?? "inconnu"})` },
        { status: 404 }
      );
    }

    const u = userData.user;
    console.log("[set-password] utilisateur trouvé:", {
      email: u.email,
      confirmed: u.email_confirmed_at,
      id: u.id,
    });

    // Mise à jour mot de passe + confirmation email forcée
    const { data: updateData, error: updateErr } = await supabase.auth.admin.updateUserById(
      userId,
      { password, email_confirm: true }
    );

    if (updateErr) {
      console.error("[set-password] erreur updateUserById:", updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log("[set-password] succès:", updateData?.user?.email);
    return NextResponse.json({
      ok: true,
      email: updateData?.user?.email ?? u.email,
      confirmed: !!updateData?.user?.email_confirmed_at,
    });
  } catch (e) {
    console.error("[set-password] exception:", e);
    return NextResponse.json({ error: "Erreur serveur inattendue" }, { status: 500 });
  }
}
