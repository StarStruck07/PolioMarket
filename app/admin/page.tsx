export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sides, type Market, type AdminUser } from "@/lib/market";
import { getProfile } from "@/lib/profile";
import { sportMeta } from "@/lib/tags";
import CreateMarketForm from "@/components/CreateMarketForm";
import AdminTabs from "@/components/AdminTabs";
import AdminUsersTable from "@/components/AdminUsersTable";

export default async function AdminPage() {
  const supabase = createSupabaseServerClient();
  const profile = await getProfile().catch(() => null);

  if (!profile) redirect("/login");
  if (!profile.is_admin) {
    return (
      <div className="card">
        <h2>Admin</h2>
        <p className="error">You are not an admin.</p>
        <p><Link href="/">← Back to matches</Link></p>
      </div>
    );
  }

  const [marketsRes, usersRes] = await Promise.all([
    supabase.from("markets").select("*").order("created_at", { ascending: false }),
    supabase.rpc("admin_list_users"),
  ]);
  const markets = (marketsRes.data as Market[] | null) ?? [];
  const users = (usersRes.data as AdminUser[] | null) ?? [];

  const manage = (
    <div className="card">
      <h3>All markets</h3>
      {markets.length === 0 ? (
        <p className="muted">No markets yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Match</th><th>Sport</th><th>Round</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {markets.map((m) => {
              const { a, b } = sides(m);
              return (
                <tr key={m.id}>
                  <td>{b ? `${a} vs ${b}` : a}</td>
                  <td>{m.sport ? `${sportMeta(m.sport).emoji} ${m.sport}` : "—"}</td>
                  <td>{m.round ?? "—"}</td>
                  <td><span className={`pill ${m.status}`}>{m.status}</span></td>
                  <td><Link href={`/market/${m.id}`}>Manage →</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ marginTop: 10 }}>
        Edit fields, close/resolve, and delete are on each match&apos;s page.
      </p>
    </div>
  );

  return (
    <>
      <h1>Admin</h1>
      <AdminTabs
        tabs={[
          { key: "create", label: "➕ Create", node: <div className="card"><h3>New market</h3><CreateMarketForm /></div> },
          { key: "manage", label: "🗂 Manage", node: manage },
          { key: "users", label: "👤 Users", node: <AdminUsersTable users={users} /> },
        ]}
      />
    </>
  );
}