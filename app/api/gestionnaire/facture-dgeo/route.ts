import { NextRequest, NextResponse } from "next/server";
import { genererFactureDGEO, type FactureInput } from "./generator";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: FactureInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  try {
    const buffer = await genererFactureDGEO(body);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="facture.xlsx"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[facture-dgeo]", err);
    return NextResponse.json(
      { error: "Erreur génération facture", details: msg.slice(0, 500) },
      { status: 500 }
    );
  }
}
