"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("Voer een geldige 6-cijferige code in.");
      return;
    }
    setLoading(true);
    setError("");
    router.push(`/speel/${trimmed}`);
  }

  return (
    <main
      className="h-dvh flex flex-col items-center justify-between px-5 py-10 overflow-hidden"
      style={{ background: "var(--game-gradient)" }}
    >
      <div />

      <div style={{ width: "100%", maxWidth: "340px", display: "flex", flexDirection: "column", alignItems: "center", gap: "32px" }}>
        <img src="/logo.png" alt="Hoekies Quiz Rondje" style={{ width: "260px", objectFit: "contain", filter: "drop-shadow(0 8px 24px rgba(0,217,255,0.25))" }} />

        <form onSubmit={handleJoin} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SESSIECODE"
            maxLength={6}
            autoFocus
            autoComplete="off"
            className="glass-input"
            style={{ textAlign: "center", fontSize: "1.8rem", fontWeight: 900, letterSpacing: "0.2em", color: "var(--cyan)", caretColor: "var(--cyan)" }}
          />
          {error && <p style={{ color: "var(--red)", fontSize: "0.85rem", textAlign: "center" }}>{error}</p>}
          <button type="submit" disabled={loading} className="btn-game" style={{ fontSize: "1.15rem" }}>
            {loading ? "Laden..." : "Meedoen 🎮"}
          </button>
        </form>
      </div>

      <a href="/admin/login" style={{ color: "var(--muted)", fontSize: "0.85rem", textDecoration: "none" }}>
        Host inloggen →
      </a>
    </main>
  );
}
