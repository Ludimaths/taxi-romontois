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

    console.log("[set-password] userId:", userId, "| pwd length:", password.length);
    const supabase = await createServiceClient();

    // Vérifier que l'utilisateur existe
    const { data: userData, error: fetchErr } = await supabase.auth.admin.getUserById(userId);
    if (fetchErr || !userData?.user) {
      console.error("[set-password] utilisateur introuvable:", fetchErr?.message);
      return NextResponse.json({ error: `Utilisateur introuvable (${fetchErr?.message ?? "inconnu"})` }, { status: 404 });
    }
    console.log("[set-password] utilisateur trouvé:", userData.user.email);

    // Supabase Auth hache automatiquement le mot de passe (bcrypt côté serveur Supabase)
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) {
      console.error("[set-password] erreur updateUserById:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("[set-password] succès pour:", userData.user.email);
    return NextResponse.json({ ok: true, email: userData.user.email });
  } catch (e) {
    console.error("[set-password] exception:", e);
    return NextResponse.json({ error: "Erreur serveur inattendue" }, { status: 500 });
  }
}
