"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/admin");
    } catch {
      setError("Inloggen mislukt. Controleer je gegevens.");
      setLoading(false);
    }
  }

  return (
    <main className="h-dvh flex flex-col items-center justify-center px-5 overflow-hidden" style={{ background: "var(--game-gradient)" }}>
      <div style={{ width: "100%", maxWidth: "360px", display: "flex", flexDirection: "column", alignItems: "center", gap: "28px" }}>

        <img src="/logo.png" alt="Hoekies Quiz Rondje" style={{ width: "100%", maxWidth: "280px", objectFit: "contain", filter: "drop-shadow(0 8px 24px rgba(0,217,255,0.25))" }} />

        <div className="glass-card" style={{ width: "100%", padding: "32px 28px" }}>
          <h1 style={{ color: "var(--ink)", fontWeight: 700, fontSize: "1.3rem", marginBottom: "20px", textAlign: "center" }}>
            Host inloggen
          </h1>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                E-mailadres
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="glass-input"
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Wachtwoord
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="glass-input"
              />
            </div>

            {error && (
              <div className="melding melding-fout" style={{ fontSize: "0.85rem" }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-game" style={{ marginTop: "4px" }}>
              {loading ? "Inloggen..." : "Inloggen"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
