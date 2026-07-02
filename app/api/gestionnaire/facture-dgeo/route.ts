import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "gen_facture.py");
  const input = JSON.stringify(body);
  const pyCmd = process.platform === "win32" ? "python" : "python3";

  return new Promise<NextResponse>((resolve) => {
    const chunks: Buffer[] = [];
    let stderr = "";

    const py = spawn(pyCmd, [scriptPath]);

    py.stdout.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    });
    py.stderr.on("data", (d: Buffer | string) => {
      stderr += Buffer.isBuffer(d) ? d.toString("utf8") : (d as string);
    });

    py.on("error", (err: Error) => {
      console.error("[facture-dgeo] Python unavailable:", err.message);
      resolve(NextResponse.json(
        { error: "Python non disponible", details: err.message },
        { status: 500 }
      ));
    });

    py.on("close", (code: number | null) => {
      if (code !== 0) {
        console.error("[facture-dgeo] Script exit", code, stderr);
        resolve(NextResponse.json(
          { error: "Erreur génération facture", details: stderr.slice(0, 500) },
          { status: 500 }
        ));
        return;
      }
      const buffer = Buffer.concat(chunks);
      resolve(new NextResponse(buffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="facture.xlsx"',
        },
      }));
    });

    py.stdin.write(input, "utf8");
    py.stdin.end();
  });
}
