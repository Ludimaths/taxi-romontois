import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { userId, password } = await req.json();

    if (!userId || !password) {
      return NextResponse.json({ error: "userId et password requis" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Mot de passe trop court (min 8 caractères)" }, { status: 400 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[set-password] SUPABASE_SERVICE_ROLE_KEY manquant");
      return NextResponse.json({ error: "Configuration serveur manquante" }, { status: 500 });
    }

    const supabase = await createServiceClient();

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
      created: u.created_at,
      id: u.id,
    });

    // Mise à jour du mot de passe + confirmation forcée de l'email
    // email_confirm: true garantit que email_confirmed_at est renseigné → connexion possible
    const { data: updateData, error: updateErr } = await supabase.auth.admin.updateUserById(
      userId,
      { password, email_confirm: true }
    );

    if (updateErr) {
      console.error("[set-password] erreur updateUserById:", updateErr.message, updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log("[set-password] succès:", {
      email: updateData?.user?.email,
      confirmed: updateData?.user?.email_confirmed_at,
    });

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
