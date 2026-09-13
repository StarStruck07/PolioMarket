"use client";

import { useState } from "react";
import type { AdminUser } from "@/lib/market";

export default function AdminUsersTable({ users }: { users: AdminUser[] }) {
  return (
    <div className="card">
      <h3>Users</h3>
      {users.length === 0 ? (
        <p className="muted">No users yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Name</th><th>Admin</th><th>Points</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => <UserRow key={u.id} user={u} />)}
          </tbody>
        </table>
      )}
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const [value, setValue] = useState(String(Number(user.balance)));
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");

  async function save() {
    setBusy(true);
    setState("idle");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, balance: Number(value) }),
      });
      if (!res.ok) throw new Error();
      setState("ok");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{user.name}</td>
      <td>{user.is_admin ? "✓" : ""}</td>
      <td>
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => { setValue(e.target.value); setState("idle"); }}
          style={{ width: 120 }}
        />
      </td>
      <td>
        <button className="secondary tiny" onClick={save} disabled={busy}>
          {busy ? "…" : state === "ok" ? "Saved ✓" : state === "error" ? "Retry" : "Set"}
        </button>
      </td>
    </tr>
  );
}
