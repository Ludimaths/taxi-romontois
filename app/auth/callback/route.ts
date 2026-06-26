import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Callback pour les liens d'invitation et de réinitialisation Supabase Auth
// URL : /auth/callback?token_hash=XXX&type=invite|recovery
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "invite" | "recovery" | "signup" | "magiclink" | "email_change",
    });
    if (!error) {
      return NextResponse.redirect(new URL("/conducteur", origin));
    }
    console.error("[auth/callback] verifyOtp error:", error.message);
  }

  return NextResponse.redirect(new URL("/login?error=lien_invalide", origin));
}
