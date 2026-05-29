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
      <div className="w-full max-w-xs flex flex-col items-center gap-8">

        {/* Logo */}
        <img
          src="/logo.png"
          alt="Hoekies Quiz Rondje"
          className="w-56 object-contain drop-shadow-lg"
        />

        {/* Card */}
        <div
          className="w-full rounded-2xl p-6 flex flex-col gap-5"
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <h1 className="text-white text-xl font-black text-center">Host inloggen</h1>

          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-white/60 text-xs font-bold uppercase tracking-wider">
                E-mailadres
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full rounded-xl px-4 py-3 text-gray-800 font-semibold border-0 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                style={{ background: "#fff" }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-white/60 text-xs font-bold uppercase tracking-wider">
                Wachtwoord
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full rounded-xl px-4 py-3 text-gray-800 font-semibold border-0 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                style={{ background: "#fff" }}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-black text-white text-base transition-all active:scale-95 disabled:opacity-60 mt-1"
              style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}
            >
              {loading ? "Inloggen..." : "Inloggen"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
