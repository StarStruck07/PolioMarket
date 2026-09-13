import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/market";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Sports Fest Prediction Market",
  description: "Virtual-points LMSR prediction market",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const profile = await getProfile(supabase).catch(() => null);

  return (
    <html lang="en">
      <body>
        <header className="nav">
          <Link className="brand" href="/">
            🎯 Fest Market
          </Link>
          <div className="spacer" />
          {profile ? (
            <>
              <span className="badge">
                {profile.name} · {Number(profile.balance).toFixed(2)} pts
                {profile.is_admin ? " · admin" : ""}
              </span>
              {profile.is_admin && <Link href="/admin">Admin</Link>}
              <SignOutButton />
            </>
          ) : (
            <Link href="/login">Sign in</Link>
          )}
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
