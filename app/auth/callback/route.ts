import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// OAuth redirect target. Exchanges the code for a session and writes the
// session cookies DIRECTLY onto the redirect response, so the very first
// return trip is authenticated (fixes the "sign in twice" issue). On failure
// (e.g. non-uni domain rejected by the DB gate) bounce to /login with a note.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const cookieStore = cookies();
  const response = NextResponse.redirect(`${origin}/`);

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // Write session cookies onto the redirect response itself.
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const msg =
      error.message.includes("signup_not_allowed") || error.message.toLowerCase().includes("database")
        ? "Please sign in with your @pilani.bits-pilani.ac.in Google account."
        : error.message;
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  }

  return response;
}
