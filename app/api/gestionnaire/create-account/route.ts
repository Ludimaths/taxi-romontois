import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function buildEmail(prenom: string, nom: string): string {
  const clean = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, ".");
  return `${clean(prenom)}.${clean(nom)}@taxi-romontois.ch`;
}

function buildPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$%!";
  const all = upper + lower + digits + special;
  const pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 0; i < 6; i++) pwd.push(all[Math.floor(Math.random() * all.length)]);
  return pwd.sort(() => Math.random() - 0.5).join("");
}

export async function POST(req: NextRequest) {
  try {
    const { conducteurId, prenom, nom } = await req.json();

    if (!conducteurId || !prenom || !nom) {
      return NextResponse.json({ error: "conducteurId, prenom et nom sont requis" }, { status: 400 });
    }

    const supabase = await createServiceClient();
    const email = buildEmail(prenom, nom);
    const password = buildPassword();

    console.log("[create-account] Création compte pour:", email, "conducteur_id:", conducteurId);

    // Création du compte Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr || !authData?.user) {
      console.error("[create-account] Auth error:", authErr?.message);
      if (authErr?.message?.toLowerCase().includes("already")) {
        return NextResponse.json(
          { error: `Un compte existe déjà avec l'email ${email}. Utilisez "Réinitialiser mot de passe" si le compte est déjà lié.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: authErr?.message ?? "Erreur création compte Auth" }, { status: 500 });
    }

    const uid = authData.user.id;

    // Création du profil lié au conducteur
    const { error: profErr } = await supabase.from("profiles").insert({
      id: uid,
      role: "conducteur",
      conducteur_id: conducteurId,
      nom,
      prenom,
    });

    if (profErr) {
      console.error("[create-account] Profile error:", profErr.message);
      // Nettoyage : supprime le compte Auth si le profil échoue
      await supabase.auth.admin.deleteUser(uid);
      return NextResponse.json({ error: `Erreur création profil : ${profErr.message}` }, { status: 500 });
    }

    console.log("[create-account] Succès :", email, "uid:", uid);
    return NextResponse.json({ ok: true, email, password });
  } catch (e) {
    console.error("[create-account] Exception:", e);
    return NextResponse.json({ error: "Erreur serveur inattendue" }, { status: 500 });
  }
}
