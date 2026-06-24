import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Hero195 } from "@/components/ui/hero-195";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const role = profile?.role ?? "conducteur";
    redirect(`/${role}`);
  }

  return <Hero195 />;
}
