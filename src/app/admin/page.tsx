"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, limit, getDocs, deleteDoc, doc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface SessionDoc {
  code: string;
  status: string;
  state: string;
  quiz_id: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.push("/admin/login");
      else setAuthChecked(true);
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    const q = query(collection(db, "sessions"), orderBy("started_at", "desc"), limit(20));
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map((d) => ({ code: d.id, ...(d.data() as Omit<SessionDoc, "code">) }));
      setSessions(docs);
      const counts: Record<string, number> = {};
      await Promise.all(docs.map(async (s) => {
        const ps = await getDocs(collection(db, "sessions", s.code, "players"));
        counts[s.code] = ps.size;
      }));
      setPlayerCounts(counts);
    });
    return unsub;
  }, [authChecked]);

  async function handleCreateSession() {
    setCreating(true);
    setCreateError("");
    const user = auth.currentUser;
    if (!user) { router.push("/admin/login"); return; }
    const token = await user.getIdToken();
    const res = await fetch("/api/host/sessie", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!res.ok) { setCreateError(json.error ?? "Er ging iets fout"); setCreating(false); return; }
    router.push(`/admin/sessie/${json.code}`);
  }

  async function handleDeleteSession(code: string) {
    if (!confirm(`Sessie ${code} verwijderen?`)) return;
    await deleteDoc(doc(db, "sessions", code));
  }

  async function handleSignOut() {
    await signOut(auth);
    router.push("/admin/login");
  }

  const statusLabel: Record<string, string> = {
    lobby: "Wacht op spelers",
    active: "Bezig",
    finished: "Afgerond",
  };

  if (!authChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--game-gradient)" }}>
        <p className="text-white/60">Laden...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10 gap-8" style={{ background: "var(--game-gradient)" }}>

      {/* Hamburger menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setMenuOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />
          {/* Menu panel */}
          <nav
            className="relative ml-auto h-full w-64 flex flex-col gap-1 p-6 z-50"
            style={{ background: "var(--game-gradient)", borderLeft: "1px solid rgba(255,255,255,0.15)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-white font-black text-lg">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="text-white/50 hover:text-white text-2xl leading-none">✕</button>
            </div>
            <a
              href="/admin/quiz"
              className="flex items-center gap-3 px-4 py-3 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-semibold"
              onClick={() => setMenuOpen(false)}
            >
              <span>📝</span> Vragen beheren
            </a>
            <a
              href="/admin"
              className="flex items-center gap-3 px-4 py-3 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-semibold"
              onClick={() => setMenuOpen(false)}
            >
              <span>🎮</span> Dashboard
            </a>
            <div className="mt-auto">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 text-red-400/80 hover:text-red-400 hover:bg-white/10 transition-colors font-semibold"
              >
                <span>→</span> Uitloggen
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Topbar */}
      <div className="w-full max-w-lg flex items-center justify-end">
        <button
          onClick={() => setMenuOpen(true)}
          className="flex flex-col gap-1.5 p-2 text-white/60 hover:text-white transition-colors"
          aria-label="Menu"
        >
          <span className="block w-6 h-0.5 bg-current" />
          <span className="block w-6 h-0.5 bg-current" />
          <span className="block w-6 h-0.5 bg-current" />
        </button>
      </div>

      {/* Logo */}
      <img
        src="/logo-vierkant.png"
        alt="Hoekies Quiz Rondje"
        className="w-36 object-contain drop-shadow-xl"
      />

      {/* Acties */}
      <div className="w-full max-w-lg flex flex-col gap-3">
        <button
          onClick={handleCreateSession}
          disabled={creating}
          className="w-full py-5 font-black text-white text-xl transition-all active:scale-95 disabled:opacity-60"
          style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}
        >
          {creating ? "Aanmaken..." : "Nieuwe sessie starten"}
        </button>
        {createError && <p className="text-red-400 text-sm text-center">{createError}</p>}
      </div>

      {/* Sessies */}
      <div className="w-full max-w-lg flex flex-col gap-3">
        <h2 className="text-white/50 text-xs font-bold uppercase tracking-widest">Sessies</h2>

        {sessions.length === 0 ? (
          <div
            className="p-6 text-center text-white/40"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            Nog geen sessies. Maak een nieuwe aan!
          </div>
        ) : (
          sessions.map((session) => (
            <a
              key={session.code}
              href={`/admin/sessie/${session.code}`}
              className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xl font-black tracking-widest" style={{ color: "var(--cyan)" }}>
                  {session.code}
                </span>
                <span className="text-white/50 text-sm">{statusLabel[session.status] ?? session.status}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-white/70 text-sm">{playerCounts[session.code] ?? 0} spelers</span>
                  <div className="text-white/30 text-xs mt-0.5">{session.state}</div>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); handleDeleteSession(session.code); }}
                  className="text-red-400/60 hover:text-red-400 text-lg px-2 py-1 transition-colors"
                  title="Sessie verwijderen"
                >
                  ✕
                </button>
              </div>
            </a>
          ))
        )}
      </div>
    </main>
  );
}
