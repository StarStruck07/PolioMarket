import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/market";
import SignOutButton from "@/components/SignOutButton";
import NavTabs from "@/components/NavTabs";

export const metadata: Metadata = {
  title: "BOSM Prediction Market",
  description: "Virtual-points LMSR prediction market for the fest",
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
            <span className="brand-mark">🎯</span> BOSM<span className="brand-accent">Market</span>
          </Link>
          <NavTabs isAdmin={!!profile?.is_admin} />
          <div className="nav-right">
            {profile ? (
              <>
                <span className="balance-pill">
                  <b>{Number(profile.balance).toFixed(0)}</b> pts
                </span>
                <span className="who">{profile.name}</span>
                <SignOutButton />
              </>
            ) : (
              <Link className="btn-link" href="/login">Sign in</Link>
            )}
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
