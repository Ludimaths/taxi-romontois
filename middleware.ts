import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// ── Role → home page ──────────────────────────────────────────────────────────
const ROLE_HOME: Record<string, string> = {
  gestionnaire: "/gestionnaire",
  conducteur:   "/conducteur",
  mecanicien:   "/mecanicien",
  admin:        "/admin",
  parent:       "/parent",
};

// ── Role → allowed path prefixes ─────────────────────────────────────────────
const ROLE_ALLOWED: Record<string, string[]> = {
  gestionnaire: ["/gestionnaire", "/api/gestionnaire", "/api/admin", "/api/export", "/api/import"],
  conducteur:   ["/conducteur"],
  mecanicien:   ["/mecanicien"],
  admin:        ["/admin", "/gestionnaire", "/mecanicien", "/parent", "/conducteur", "/api/admin", "/api/gestionnaire", "/api/export", "/api/import"],
  parent:       ["/parent"],
};

const PROTECTED_PAGES: string[] = ["/gestionnaire", "/conducteur", "/mecanicien", "/admin", "/parent"];
const PROTECTED_APIS: string[]  = ["/api/gestionnaire", "/api/admin", "/api/export", "/api/import"];
const PUBLIC_PREFIXES: string[] = ["/login", "/scan/", "/api/vehicule/", "/auth/callback", "/_next/", "/favicon", "/logo.png"];

function matchesAny(path: string, prefixes: string[]): boolean {
  return prefixes.some(p => path.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Pass through public paths immediately ──────────────────────────────
  if (pathname === "/" || matchesAny(pathname, PUBLIC_PREFIXES)) {
    return NextResponse.next();
  }

  const isProtectedPage = matchesAny(pathname, PROTECTED_PAGES);
  const isProtectedAPI  = matchesAny(pathname, PROTECTED_APIS);

  if (!isProtectedPage && !isProtectedAPI) {
    return NextResponse.next();
  }

  // ── 2. Build Supabase client (MUST stay just before getUser) ─────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          // Propagate refreshed tokens
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── 3. Verify session (validates JWT server-side via Supabase auth) ────────
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (isProtectedAPI) {
      return NextResponse.json({ error: "Non authentifié — connexion requise" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ── 4. Fetch role and enforce access control ──────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    if (isProtectedAPI) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = profile.role as string;
  const allowed = ROLE_ALLOWED[role] ?? [];

  if (!matchesAny(pathname, allowed)) {
    if (isProtectedAPI) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    // Redirect to the correct home for this role
    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[role] ?? "/login";
    return NextResponse.redirect(url);
  }

  // ── 5. Inject pathname into request headers (readable by server layouts) ──
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Carry over any refreshed session cookies
  supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
    response.cookies.set(name, value);
  });
  return response;
}

export const config = {
  matcher: [
    // All paths except _next internals and common static assets
    "/((?!_next/static|_next/image|favicon\\.ico|logo\\.png|.*\\.svg|.*\\.webp|.*\\.ico).*)",
  ],
};
