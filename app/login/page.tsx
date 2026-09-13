"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name || email.split("@")[0] } },
        });
        if (error) throw error;
        setMsg("Account created. If email confirmation is off, you can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 380, margin: "40px auto" }}>
      <h2>{mode === "signin" ? "Sign in" : "Create account"}</h2>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <>
            <label>Display name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alice" style={{ width: "100%" }} />
          </>
        )}
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: "100%" }} />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ width: "100%" }} />
        <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 14 }}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}
      <p className="muted" style={{ marginTop: 12 }}>
        {mode === "signin" ? "No account?" : "Have an account?"}{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setMode(mode === "signin" ? "signup" : "signin");
            setMsg(null);
          }}
        >
          {mode === "signin" ? "Sign up" : "Sign in"}
        </a>
      </p>
    </div>
  );
}
