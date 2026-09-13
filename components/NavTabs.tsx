"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavTabs({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const tabs: [string, string][] = [
    ["/", "Matches"],
    ["/leaderboard", "Leaderboard"],
    ["/portfolio", "Portfolio"],
  ];
  if (isAdmin) tabs.push(["/admin", "Admin"]);

  return (
    <nav className="navtabs">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? "navtab active" : "navtab"}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
