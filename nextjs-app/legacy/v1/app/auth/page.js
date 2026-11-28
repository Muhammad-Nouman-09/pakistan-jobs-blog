"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/util";

export default function AuthPage() {
  const { setUser } = useAuth();
  const [msg, setMsg] = useState(null);

  async function submit(e, path) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const { user } = await api(path, { method: "POST", body });
      setUser(user);
      const register = path.endsWith("register");
      setMsg({
        ok: true,
        text: register
          ? user.role === "employer"
            ? "Account created as pending. An admin must verify you before you can post jobs — you can complete your profile meanwhile."
            : `Account created. Welcome, ${user.name}!`
          : `Signed in. Welcome back, ${user.name}.`
      });
      setTimeout(() => { window.location.href = !register && user.role === "admin" ? "/admin" : "/profile"; }, 500);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  }

  return (
    <main className="section">
      <div className="container">
        <div className="form-card">
          <h1 style={{ fontSize: 28 }}>Sign In</h1>
          <p className="muted">Job seekers, employers and admin sign in here.</p>
          <form onSubmit={(e) => submit(e, "/api/auth/login")}>
            <label>Email *</label><input name="email" type="email" required />
            <label>Password *</label><input name="password" type="password" required />
            <p><button className="btn btn-dark btn-block" type="submit">Sign In</button></p>
          </form>
          {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
        </div>

        <div className="form-card" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 24 }}>Join Free</h2>
          <p className="muted">Job seekers are active immediately. Employers register as <b>pending</b> — an admin must verify you before you can post jobs.</p>
          <form onSubmit={(e) => submit(e, "/api/auth/register")}>
            <label>Your name *</label><input name="name" required />
            <label>Email *</label><input name="email" type="email" required />
            <label>Password *</label><input name="password" type="password" minLength={6} required placeholder="At least 6 characters" />
            <label>I am a… *</label>
            <select name="role">
              <option value="seeker">Job Seeker — looking for work</option>
              <option value="employer">Employer — I want to post jobs</option>
            </select>
            <p><button className="btn btn-green btn-block" type="submit">Create my free account</button></p>
          </form>
          <p className="muted">By joining you agree to the <Link href="/terms">Terms and Conditions</Link>.</p>
        </div>
      </div>
    </main>
  );
}
