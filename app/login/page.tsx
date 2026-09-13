"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const UNI_DOMAIN = "pilani.bits-pilani.ac.in";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(params.get("error"));

  async function google() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: UNI_DOMAIN, prompt: "select_account" },
      },
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
    }
  }

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="card login-card">
      <h2>Welcome to BOSM Market</h2>
      <p className="muted">Students: sign in with your college Google account.</p>

      <button className="google-btn" onClick={google} disabled={busy}>
        <span className="g">G</span> Continue with Google
      </button>
      <p className="muted tiny-note">Only <b>@{UNI_DOMAIN}</b> accounts are allowed.</p>

      <div className="divider"><span>admin sign-in</span></div>

      <form onSubmit={emailLogin}>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" className="secondary" disabled={busy} style={{ width: "100%", marginTop: 12 }}>
          {busy ? "…" : "Sign in with email"}
        </button>
      </form>

      {msg && <p className="error" style={{ marginTop: 14 }}>{msg}</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="card login-card">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
