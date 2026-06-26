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

  // Defense-in-depth role check (middleware is the primary guard)
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  if (pathname) {
    const requiredPrefix = ROLE_PREFIX[profile.role];
    if (requiredPrefix && !pathname.startsWith(requiredPrefix)) {
      redirect(ROLE_HOME[profile.role] ?? "/login");
    }
  }

  return (
    <ProtectedLayoutClient profile={profile}>
      {children}
    </ProtectedLayoutClient>
  );
}
