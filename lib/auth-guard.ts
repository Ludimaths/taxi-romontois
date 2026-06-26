import { createClient } from "@/lib/supabase/server";

type AuthOk   = { userId: string; role: string };
type AuthFail = { guard: Response };
type AuthResult = AuthOk | AuthFail;

/**
 * Verifies that the caller is authenticated and holds one of the allowed roles.
 * Usage in API routes:
 *   const auth = await requireRole(["gestionnaire", "admin"]);
 *   if ("guard" in auth) return auth.guard;
 *   // auth.userId / auth.role available here
 */
export async function requireRole(allowedRoles: string[]): Promise<AuthResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      guard: Response.json({ error: "Non authentifié — connexion requise" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { guard: Response.json({ error: "Profil introuvable" }, { status: 403 }) };
  }

  if (!allowedRoles.includes(profile.role)) {
    return {
      guard: Response.json(
        { error: `Accès refusé — rôle requis : ${allowedRoles.join(" ou ")}` },
        { status: 403 }
      ),
    };
  }

  return { userId: user.id, role: profile.role };
}
