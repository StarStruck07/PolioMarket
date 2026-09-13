import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile, sides, type Market } from "@/lib/market";
import { sportMeta } from "@/lib/tags";
import CreateMarketForm from "@/components/CreateMarketForm";
import AdminTabs from "@/components/AdminTabs";

export default async function AdminPage() {
  const supabase = createSupabaseServerClient();
  const profile = await getProfile(supabase).catch(() => null);

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

  const { data } = await supabase
    .from("markets")
    .select("*")
    .order("created_at", { ascending: false });
  const markets = (data as Market[] | null) ?? [];

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
      <AdminTabs create={<div className="card"><h3>New market</h3><CreateMarketForm /></div>} manage={manage} />
    </>
  );
}
