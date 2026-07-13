import React, { useState } from "react";
import { api } from "./lib/api.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await api.auth.signIn(email.trim(), password);
    setBusy(false);
    if (error) setErr(error.message);
    // success: App is listening on onAuthStateChange and swaps this out
  };

  return (
    <div className="login">
      <style>{LOGIN_CSS}</style>
      <div className="login-card">
        <div className="login-brand">
          <svg viewBox="0 0 100 40" className="login-pulse" aria-hidden="true">
            <polyline points="0,20 24,20 32,6 40,34 48,20 62,20 68,14 74,26 80,20 100,20" />
          </svg>
          <b>COMPUTER</b>
          <span>DOCTOR</span>
        </div>

        <form onSubmit={submit}>
          <label>Email</label>
          <input
            className="li"
            type="email"
            autoFocus
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label>Password</label>
          <input
            className="li"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <div className="login-err">{err}</div>}
          <button className="login-btn" disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="login-foot">
          Staff accounts are created by the owner in the Supabase dashboard.
        </p>
      </div>
    </div>
  );
}

const LOGIN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;600&display=swap');
.login { min-height: 100vh; display: grid; place-items: center; background: #14464F;
  background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,.05) 1px, transparent 0);
  background-size: 7px 7px; font-family: 'Inter', system-ui, sans-serif; padding: 20px; }
.login-card { width: 100%; max-width: 360px; background: #fff; border-radius: 3px; padding: 34px 30px;
  box-shadow: 0 30px 60px -30px rgba(0,0,0,.6); }
.login-brand { text-align: center; margin-bottom: 26px; font-family: 'Barlow Condensed', sans-serif; line-height: .95; }
.login-pulse { width: 74px; height: 26px; display: block; margin: 0 auto 8px; }
.login-pulse polyline { fill: none; stroke: #F0A81C; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.login-brand b { display: block; font-size: 30px; letter-spacing: .04em; color: #11262B; }
.login-brand span { display: block; font-size: 30px; letter-spacing: .3em; color: #C4830B; font-weight: 600; }
.login label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .14em;
  color: #64807F; font-weight: 600; margin: 14px 0 6px; }
.li { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #D7E2DF; border-radius: 2px;
  background: #F9FCFB; font-size: 15px; color: #11262B; outline: none; font-family: inherit; }
.li:focus { border-color: #14464F; background: #fff; box-shadow: 0 0 0 3px rgba(20,70,79,.1); }
.login-btn { width: 100%; margin-top: 22px; padding: 13px; border: 0; border-radius: 2px; background: #14464F;
  color: #fff; font-family: 'Barlow Condensed', sans-serif; font-size: 17px; letter-spacing: .08em;
  text-transform: uppercase; font-weight: 600; cursor: pointer; }
.login-btn:hover:not(:disabled) { background: #0C2B31; }
.login-btn:disabled { opacity: .5; cursor: not-allowed; }
.login-err { margin-top: 14px; padding: 9px 12px; background: #FBEAE7; border-left: 3px solid #C4402E;
  color: #8A2E20; font-size: 13px; }
.login-foot { margin: 20px 0 0; font-size: 11px; color: #64807F; text-align: center; line-height: 1.5; }
`;
