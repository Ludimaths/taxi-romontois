import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { userId, password } = await req.json();
    if (!userId || !password || password.length < 8) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }
    const supabase = await createServiceClient();
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
