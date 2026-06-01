"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface ThemeSettings {
  logo_url?: string;
  background_url?: string;
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<ThemeSettings>({});
  const router = useRouter();

  useEffect(() => {
    getDoc(doc(db, "settings", "theme")).then((snap) => {
      if (snap.exists()) setTheme(snap.data() as ThemeSettings);
    });
  }, []);

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

  const bgStyle = theme.background_url
    ? {
        backgroundImage: `linear-gradient(rgba(6,14,26,0.75), rgba(6,14,26,0.85)), url(${theme.background_url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: "var(--game-gradient)" };

  return (
    <main className="h-dvh flex flex-col items-center justify-center px-5 overflow-hidden" style={bgStyle}>
      <div style={{ width: "100%", maxWidth: "360px", display: "flex", flexDirection: "column", alignItems: "center", gap: "28px" }}>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={theme.logo_url ?? "/logo-vierkant.png"}
          alt="Hoekies Quiz Rondje"
          style={{ width: "120px", height: "120px", objectFit: "contain", filter: "drop-shadow(0 8px 24px rgba(13,180,171,0.25))" }}
        />

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
