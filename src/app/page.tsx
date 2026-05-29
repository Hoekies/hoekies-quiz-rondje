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
      className="min-h-screen flex flex-col items-center justify-between px-4 py-12"
      style={{ background: "var(--game-gradient)" }}
    >
      {/* Spacer top */}
      <div />

      <div className="w-full max-w-sm flex flex-col items-center gap-10">
        {/* Logo */}
        <img
          src="/logo.png"
          alt="Hoekies Quiz Rondje"
          className="w-72 object-contain drop-shadow-xl"
        />

        {/* Formulier */}
        <form onSubmit={handleJoin} className="w-full flex flex-col gap-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SESSIECODE"
            maxLength={6}
            autoFocus
            autoComplete="off"
            className="w-full rounded-2xl px-5 py-5 text-center text-3xl font-black tracking-widest uppercase border-2 focus:outline-none transition-colors"
            style={{
              background: "rgba(255,255,255,0.10)",
              color: "var(--cyan)",
              caretColor: "var(--cyan)",
              borderColor: "rgba(255,255,255,0.20)",
            }}
          />

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 rounded-2xl text-xl font-black text-white transition-all active:scale-95 disabled:opacity-60"
            style={{
              background: "var(--cyan)",
              boxShadow: "var(--crt-glow)",
            }}
          >
            {loading ? "Laden..." : "Meedoen 🎮"}
          </button>
        </form>
      </div>

      {/* Host link onderaan */}
      <a
        href="/admin/login"
        className="text-white/30 text-sm hover:text-white/60 transition-colors"
      >
        Host inloggen →
      </a>
    </main>
  );
}
