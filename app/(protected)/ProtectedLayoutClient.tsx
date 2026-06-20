"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Sidebar from "@/components/Sidebar";
import { C } from "@/lib/constants";
import type { Profile } from "@/lib/types";

export default function ProtectedLayoutClient({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: C.gray50, color: C.gray800 }}>
      <Sidebar
        role={profile.role}
        nom={profile.nom}
        prenom={profile.prenom}
        onSignOut={handleSignOut}
      />
      <div style={{ flex: 1, overflow: "auto", padding: 26 }}>
        {children}
      </div>
    </div>
  );
}
