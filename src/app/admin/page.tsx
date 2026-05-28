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
  player_count?: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/admin/login");
      } else {
        setAuthChecked(true);
      }
    });
    return unsub;
  }, [router]);

  // Subscribe to sessions
  useEffect(() => {
    if (!authChecked) return;

    const q = query(
      collection(db, "sessions"),
      orderBy("started_at", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map((d) => ({
        code: d.id,
        ...(d.data() as Omit<SessionDoc, "code">),
      }));
      setSessions(docs);

      // Fetch player counts for each session
      const counts: Record<string, number> = {};
      await Promise.all(
        docs.map(async (s) => {
          const playerSnap = await getDocs(
            collection(db, "sessions", s.code, "players")
          );
          counts[s.code] = playerSnap.size;
        })
      );
      setPlayerCounts(counts);
    });

    return unsub;
  }, [authChecked]);

  async function handleCreateSession() {
    setCreating(true);
    setCreateError("");

    const user = auth.currentUser;
    if (!user) {
      router.push("/admin/login");
      return;
    }

    const token = await user.getIdToken();

    const res = await fetch("/api/host/sessie", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    const json = await res.json();

    if (!res.ok) {
      setCreateError(json.error ?? "Er ging iets fout");
      setCreating(false);
      return;
    }

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
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-white/60">Laden...</p>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen p-6"
      style={{ background: "var(--game-gradient)" }}
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-black">Quiz Dashboard</h1>
            <p className="text-white/50 text-sm">Hoekies Quiz Rondje</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-white/40 text-sm hover:text-white/70 transition-colors"
          >
            Uitloggen
          </button>
        </div>

        {/* New session button */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleCreateSession}
            disabled={creating}
            className="w-full py-4 rounded-xl font-black text-white text-lg transition-all active:scale-95 disabled:opacity-60"
            style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}
          >
            {creating ? "Aanmaken..." : "Nieuwe sessie starten"}
          </button>
          {createError && (
            <p className="text-red-400 text-sm text-center">{createError}</p>
          )}
        </div>

        {/* Session list */}
        <div className="flex flex-col gap-3">
          <h2 className="text-white/70 text-sm font-bold uppercase tracking-wider">
            Sessies
          </h2>

          {sessions.length === 0 ? (
            <div
              className="rounded-xl p-6 text-center text-white/40"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              Nog geen sessies. Maak een nieuwe aan!
            </div>
          ) : (
            sessions.map((session) => (
              <a
                key={session.code}
                href={`/admin/sessie/${session.code}`}
                className="flex items-center justify-between rounded-xl px-5 py-4 transition-all hover:scale-[1.01]"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-xl font-black tracking-widest"
                    style={{ color: "var(--cyan)" }}
                  >
                    {session.code}
                  </span>
                  <span className="text-white/50 text-sm">
                    {statusLabel[session.status] ?? session.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-white/70 text-sm">
                      {playerCounts[session.code] ?? 0} spelers
                    </span>
                    <div className="text-white/30 text-xs mt-0.5">
                      {session.state}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDeleteSession(session.code); }}
                    className="text-red-400 hover:text-red-300 text-xl font-bold px-2 py-1 rounded transition-colors"
                    title="Sessie verwijderen"
                  >
                    ✕
                  </button>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
