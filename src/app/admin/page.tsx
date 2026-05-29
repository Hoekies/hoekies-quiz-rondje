"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, limit, getDocs, deleteDoc, doc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import AdminLayout from "./AdminLayout";

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

  const statusLabel: Record<string, string> = {
    lobby: "Wacht op spelers",
    active: "Bezig",
    finished: "Afgerond",
  };
  const statusColor: Record<string, string> = {
    lobby: "var(--cyan)",
    active: "var(--green)",
    finished: "var(--muted)",
  };

  if (!authChecked) return null;

  return (
    <AdminLayout title="Dashboard">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "640px" }}>

        {/* Nieuwe sessie */}
        <div>
          <button onClick={handleCreateSession} disabled={creating} className="btn-game">
            {creating ? "Aanmaken..." : "🚀 Nieuwe sessie starten"}
          </button>
          {createError && <p style={{ color: "var(--red)", fontSize: "0.85rem", marginTop: "8px" }}>{createError}</p>}
        </div>

        {/* Sessies */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Sessies
          </p>

          {sessions.length === 0 ? (
            <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: "32px" }}>
              Nog geen sessies. Maak een nieuwe aan!
            </div>
          ) : (
            sessions.map((session) => (
              <a
                key={session.code}
                href={`/admin/sessie/${session.code}`}
                className="card"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", cursor: "pointer", transition: "background 0.15s" }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ color: "var(--cyan)", fontWeight: 900, fontSize: "1.2rem", letterSpacing: "0.12em" }}>
                    {session.code}
                  </span>
                  <span style={{ color: statusColor[session.status] ?? "var(--muted)", fontSize: "0.82rem", fontWeight: 600 }}>
                    {statusLabel[session.status] ?? session.status}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <span style={{ color: "var(--text)", fontSize: "0.85rem" }}>
                    {playerCounts[session.code] ?? 0} spelers
                  </span>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDeleteSession(session.code); }}
                    style={{ color: "var(--red)", background: "none", border: "none", cursor: "pointer", fontSize: "1rem", opacity: 0.6, padding: "4px 8px" }}
                    title="Verwijderen"
                  >✕</button>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
