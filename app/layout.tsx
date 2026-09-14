import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { getProfile } from "@/lib/profile";
import SignOutButton from "@/components/SignOutButton";
import NavTabs from "@/components/NavTabs";
import ScrollReveal from "@/components/ScrollReveal";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "BOSM Prediction Market",
  description: "Live prediction markets for every fest fixture.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile().catch(() => null);

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <ScrollReveal />
        <header className="nav">
          <Link className="brand" href="/">
            BOSM<span className="brand-accent">Market</span>
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
        <footer className="site-footer">
          <span>BOSM Market</span>
        </footer>
      </body>
    </html>
  );
}
