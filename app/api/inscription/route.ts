import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// prenom.nom@taxi-romontois.ch (sans accents ni espaces)
function buildEmail(prenom: string, nom: string): string {
  const clean = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, ".");
  return `${clean(prenom)}.${clean(nom)}@taxi-romontois.ch`;
}

// ── GET : liste publique des responsables (pour le menu du formulaire) ──────────
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("conducteurs")
      .select("id,prenom,nom,secteur").eq("est_responsable", true).order("secteur");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ responsables: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST : auto-inscription d'un conducteur ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { prenom, nom, tel, secteur, password } = await req.json();

    if (!prenom || !nom || !password) {
      return NextResponse.json({ error: "Prénom, nom et mot de passe sont requis." }, { status: 400 });
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: "Le mot de passe doit faire au moins 8 caractères." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const email = buildEmail(prenom, nom);

    // 1) Fiche conducteur
    const { data: cond, error: condErr } = await supabase.from("conducteurs").insert({
      nom, prenom, tel: tel || null, secteur: secteur || null,
      affectation: "Conducteur", status: "disponible", est_responsable: false,
      photo_initials: ((prenom[0] || "") + (nom[0] || "")).toUpperCase(),
    }).select("id").single();

    if (condErr || !cond) {
      return NextResponse.json({ error: `Erreur fiche conducteur : ${condErr?.message}` }, { status: 500 });
    }
    const conducteurId = cond.id;

    // 2) Compte auth (email confirmé, mot de passe choisi par le conducteur)
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { conducteur_id: conducteurId, prenom, nom },
    });

    if (authErr || !authData?.user) {
      // Pas de compte créé → on retire la fiche pour ne pas laisser d'orphelin
      await supabase.from("conducteurs").delete().eq("id", conducteurId);
      const msg = authErr?.message?.includes("already been registered")
        ? "Un compte existe déjà avec ce nom. Contactez votre responsable."
        : (authErr?.message ?? "Erreur lors de la création du compte.");
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    const uid = authData.user.id;

    // 3) Profil (créé par le trigger handle_new_user → on le complète et on relie la fiche)
    const { data: existing } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
    if (existing) {
      await supabase.from("profiles").update({
        role: "conducteur", conducteur_id: conducteurId, nom, prenom, must_change_password: false,
      }).eq("id", uid);
    } else {
      await supabase.from("profiles").insert({
        id: uid, role: "conducteur", conducteur_id: conducteurId, nom, prenom, must_change_password: false,
      });
    }

    return NextResponse.json({ ok: true, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[inscription]", msg);
    return NextResponse.json({ error: "Erreur serveur inattendue." }, { status: 500 });
  }
}
