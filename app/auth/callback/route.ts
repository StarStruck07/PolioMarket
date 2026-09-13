import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// OAuth redirect target: exchanges the code for a session, then sends the
// user home. On failure (e.g. non-uni domain rejected by the DB gate),
// bounce back to /login with a message.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(oauthError)}`, url.origin));
  }

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const msg =
        error.message.includes("signup_not_allowed") || error.message.toLowerCase().includes("database")
          ? "Please sign in with your @pilani.bits-pilani.ac.in Google account."
          : error.message;
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/", url.origin));
}
