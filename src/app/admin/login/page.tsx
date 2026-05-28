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
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--game-gradient)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.14)",
        }}
      >
        {/* Logo */}
        <div className="flex justify-center">
          <img
            src="/logo-breed.jpeg"
            alt="Hoekies Quiz Rondje"
            className="w-40 object-contain"
          />
        </div>

        <div className="text-center">
          <h1 className="text-white text-2xl font-black">Host inloggen</h1>
          <p className="text-white/50 text-sm mt-1">Hoekies Quiz Rondje</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-white/70 text-sm font-semibold">
              E-mailadres
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full rounded-xl px-4 py-3 text-white border focus:outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.08)",
                borderColor: "rgba(255,255,255,0.18)",
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-white/70 text-sm font-semibold">
              Wachtwoord
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-xl px-4 py-3 text-white border focus:outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.08)",
                borderColor: "rgba(255,255,255,0.18)",
              }}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-black text-white text-lg transition-all active:scale-95 disabled:opacity-60 mt-2"
            style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}
          >
            {loading ? "Inloggen..." : "Inloggen"}
          </button>
        </form>
      </div>
    </main>
  );
}
