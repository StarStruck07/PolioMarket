import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/market";
import CreateMarketForm from "@/components/CreateMarketForm";

export default async function AdminPage() {
  const supabase = createSupabaseServerClient();
  const profile = await getProfile(supabase).catch(() => null);

  if (!profile) redirect("/login");
  if (!profile.is_admin) {
    return (
      <div className="card">
        <h2>Admin</h2>
        <p className="error">You are not an admin.</p>
        <p className="muted">
          Bootstrap one in SQL: <code>update users set is_admin = true where id = &apos;…&apos;;</code>
        </p>
        <p><Link href="/">← Back</Link></p>
      </div>
    );
  }

  return (
    <>
      <h1>Admin</h1>
      <div className="card">
        <h3>Create a market</h3>
        <CreateMarketForm />
      </div>
      <p className="muted">
        Open/close and resolution controls live on each market&apos;s page.
      </p>
    </>
  );
}
