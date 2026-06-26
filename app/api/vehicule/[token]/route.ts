import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Route publique — scan QR véhicule, lookup par qr_token UUID (non devinable)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const qrToken = decodeURIComponent(token);

  const sb = createAdminClient();
  const sel = "*, circuit:circuits(*,cercle:cercles_scolaires(*)), conducteur:conducteurs(*)";

  const { data } = await sb.from("vehicules").select(sel).eq("qr_token", qrToken).maybeSingle();
  if (!data) return NextResponse.json({ vehicle: null }, { status: 404 });
  return NextResponse.json({ vehicle: data });
}
