"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const UNI_DOMAIN = "pilani.bits-pilani.ac.in";

function LoginInner() {
  const params = useSearchParams();
  const supabase = createSupabaseBrowserClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(params.get("error"));

  async function google() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="card login-card">
      <div className="login-badge">🎯</div>
      <h2>Welcome to BOSM Market</h2>
      <p className="muted">Sign in with your college Google account to start predicting.</p>

      <button className="google-btn" onClick={google} disabled={busy}>
        <span className="g">G</span> {busy ? "Redirecting…" : "Continue with Google"}
      </button>
      <p className="tiny-note">Only <b>@{UNI_DOMAIN}</b> accounts are allowed.</p>

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
