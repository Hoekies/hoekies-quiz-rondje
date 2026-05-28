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
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--game-gradient)" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo */}
        <img
          src="/logo-breed.jpeg"
          alt="Hoekies Quiz Rondje"
          className="w-64 object-contain"
        />

        {/* Card */}
        <div
          className="w-full rounded-2xl p-8 flex flex-col gap-6"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          <h1 className="text-white text-center text-2xl font-black">
            Doe mee!
          </h1>

          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SESSIECODE"
              maxLength={6}
              autoFocus
              autoComplete="off"
              className="w-full rounded-xl px-5 py-4 text-center text-2xl font-black tracking-widest uppercase border-2 focus:outline-none transition-colors"
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
              className="w-full py-4 rounded-xl text-lg font-black text-white transition-all active:scale-95 disabled:opacity-60"
              style={{
                background: "var(--cyan)",
                boxShadow: "var(--crt-glow)",
              }}
            >
              {loading ? "Laden..." : "Meedoen 🎮"}
            </button>
          </form>
        </div>

        {/* Host link */}
        <a
          href="/admin/login"
          className="text-white/40 text-sm hover:text-white/70 transition-colors"
        >
          Host inloggen →
        </a>
      </div>
    </main>
  );
}
