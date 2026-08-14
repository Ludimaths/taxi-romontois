import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import ProtectedLayoutClient from "./ProtectedLayoutClient";

const ROLE_HOME: Record<string, string> = {
  gestionnaire: "/gestionnaire",
  conducteur:   "/conducteur",
  mecanicien:   "/mecanicien",
  admin:        "/admin",
  parent:       "/parent",
};

const ROLE_PREFIX: Record<string, string> = {
  gestionnaire: "/gestionnaire",
  conducteur:   "/conducteur",
  mecanicien:   "/mecanicien",
  admin:        "/admin",
  parent:       "/parent",
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // ── Responsable de secteur ──────────────────────────────────────────────
  // Un conducteur marqué « est_responsable » peut aussi ouvrir les pages de
  // gestion de son secteur (établissements / conducteurs / véhicules).
  let isResponsable = false;
  let monSecteur: string | null = null;
  if (profile.role === "conducteur" && profile.conducteur_id) {
    const { data: cond } = await supabase
      .from("conducteurs")
      .select("est_responsable, secteur")
      .eq("id", profile.conducteur_id)
      .maybeSingle();
    isResponsable = !!cond?.est_responsable;
    monSecteur = cond?.secteur ?? null;
  }

  // Defense-in-depth role check (middleware is the primary guard)
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  const RESP_ROUTES = ["/gestionnaire/etablissements", "/gestionnaire/conducteurs", "/gestionnaire/vehicules"];

  // Admin a accès à toutes les routes (vision globale)
  if (pathname && profile.role !== "admin") {
    const requiredPrefix = ROLE_PREFIX[profile.role];
    const responsableAllowed = isResponsable && RESP_ROUTES.some(p => pathname.startsWith(p));
    if (requiredPrefix && !pathname.startsWith(requiredPrefix) && !responsableAllowed) {
      redirect(ROLE_HOME[profile.role] ?? "/login");
    }
  }

  return (
    <ProtectedLayoutClient profile={profile} isResponsable={isResponsable} monSecteur={monSecteur}>
      {children}
    </ProtectedLayoutClient>
  );
}
