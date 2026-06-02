"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1000);
    return () => clearTimeout(t);
  }, []);

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

  if (showSplash) {
    return (
      <main className="h-dvh flex flex-col items-center justify-center px-5 overflow-hidden" style={{ background: "var(--game-gradient)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", width: "100%", maxWidth: "300px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-vierkant.png" alt="Hoekies Quiz Rondje" style={{ width: "clamp(140px, 50vw, 200px)", height: "clamp(140px, 50vw, 200px)", objectFit: "contain", animation: "pulse 1.5s ease-in-out infinite" }} />
          <div style={{ width: "100%", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: "3px", background: "var(--cyan)", animation: "splashbar 1s linear forwards" }} />
          </div>
        </div>
        <style>{`@keyframes splashbar { from { width: 0% } to { width: 100% } }`}</style>
      </main>
    );
  }

  return (
    <main
      className="h-dvh flex flex-col items-center justify-between px-5 py-10 overflow-hidden"
      style={{ background: "var(--game-gradient)" }}
    >
      <div />

      <div style={{ width: "100%", maxWidth: "340px", display: "flex", flexDirection: "column", alignItems: "center", gap: "32px" }}>
        <img src="/logo.png" alt="Hoekies Quiz Rondje" style={{ width: "260px", objectFit: "contain", filter: "drop-shadow(0 8px 24px rgba(13,180,171,0.25))" }} />

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
