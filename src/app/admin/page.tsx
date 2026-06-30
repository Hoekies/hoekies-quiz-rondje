"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import AdminLayout from "./AdminLayout";
import SessionControl from "./SessionControl";

interface SessionDoc {
  code: string;
  status: string;
  state: string;
  quiz_id: string;
  is_active?: boolean;
  question_order?: string[];
  current_question_id?: string | null;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.push("/admin/login");
      else setAuthChecked(true);
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    const q = query(collection(db, "sessions"), orderBy("created_at", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ code: d.id, ...(d.data() as Omit<SessionDoc, "code">) }));
      setSessions(docs);
    });
    return () => { unsub(); };
  }, [authChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateSession() {
    setCreating(true); setCreateError("");
    const user = auth.currentUser;
    if (!user) { router.push("/admin/login"); return; }
    const token = await user.getIdToken();
    const res = await fetch("/api/host/sessie", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ concept: true }),
    });
    const json = await res.json();
    if (!res.ok) { setCreateError(json.error ?? "Er ging iets fout"); }
    setCreating(false);
  }

  async function handleDeleteSession(code: string) {
    if (!confirm(`Sessie ${code} verwijderen?`)) return;
    await deleteDoc(doc(db, "sessions", code));
  }

  async function handleToggleActive(session: SessionDoc) {
    setToggleError("");
    // Als we activeren, controleer of er al een andere actieve sessie is
    if (!session.is_active) {
      const alreadyActive = sessions.find((s) => s.code !== session.code && s.is_active);
      if (alreadyActive) {
        setToggleError(`Sessie ${alreadyActive.code} is al actief. Zet die eerst inactief voordat je een andere activeert.`);
        return;
      }
    }
    setToggling(session.code);
    await updateDoc(doc(db, "sessions", session.code), { is_active: !session.is_active });
    setToggling(null);
  }


  const statusLabel: Record<string, string> = { lobby: "Wacht op spelers", active: "Bezig", finished: "Afgerond" };
  const statusColor: Record<string, string> = { lobby: "var(--cyan)", active: "var(--green)", finished: "var(--muted)" };

  if (!authChecked) return null;

  const activeSession = sessions.find((s) => s.is_active && s.status !== "finished");
  const otherSessions = sessions.filter((s) => s.code !== activeSession?.code);

  const Toggle = ({ session, onToggle }: { session: SessionDoc; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      disabled={!!toggling}
      title={session.is_active ? "Zet inactief" : "Zet actief"}
      style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "7px 14px", borderRadius: "8px", border: "none",
        background: session.is_active ? "rgba(13,180,171,0.15)" : "rgba(255,255,255,0.06)",
        color: session.is_active ? "var(--cyan)" : "var(--muted)",
        fontSize: "0.8rem", fontWeight: 700, cursor: toggling ? "not-allowed" : "pointer",
        transition: "all 0.15s", fontFamily: "var(--font)", flexShrink: 0,
      }}>
      <div style={{
        width: "30px", height: "17px", borderRadius: "99px",
        background: session.is_active ? "var(--cyan)" : "rgba(255,255,255,0.18)",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: "2.5px",
          left: session.is_active ? "15px" : "2.5px",
          width: "12px", height: "12px", borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
        }} />
      </div>
      {session.is_active ? "Actief" : "Inactief"}
    </button>
  );

  return (
    <AdminLayout title="Dashboard">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "780px" }}>

        {/* Actieve sessie */}
        {activeSession && (
          <>
            {/* Sessie-header: code + status + QR-thumbnail + toggle + verwijderen */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor[activeSession.status] ?? "var(--muted)", flexShrink: 0, boxShadow: `0 0 6px ${statusColor[activeSession.status] ?? "var(--muted)"}` }} />
                <span style={{ color: "#fff", fontWeight: 900, fontSize: "1.4rem", letterSpacing: "0.08em" }}>{activeSession.code}</span>
                <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{statusLabel[activeSession.status] ?? activeSession.status}</span>
              </div>

              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <Toggle session={activeSession} onToggle={() => handleToggleActive(activeSession)} />
                <button onClick={() => handleDeleteSession(activeSession.code)} title="Sessie verwijderen"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "8px", border: "1px solid rgba(255,59,92,0.3)", background: "rgba(255,59,92,0.06)", color: "var(--red)", cursor: "pointer", fontSize: "1rem" }}>
                  ✕
                </button>
              </div>
            </div>

            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)" }} />

            {/* Live besturing */}
            <SessionControl code={activeSession.code} />
          </>
        )}

        {/* Foutmelding toggle */}
        {toggleError && (
          <div className="melding melding-fout">
            <span>⚠</span>
            <span style={{ flex: 1 }}>{toggleError}</span>
            <button onClick={() => setToggleError("")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>✕</button>
          </div>
        )}

        {/* Nieuwe sessie aanmaken */}
        {sessions.length === 0 && (
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "40px 24px", textAlign: "center" }}>
            <p style={{ fontSize: "2.5rem" }}>🎮</p>
            <div>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: "1rem" }}>Nog geen sessie</p>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "4px" }}>Maak een nieuwe sessie aan om de quiz te starten.</p>
            </div>
            <button onClick={handleCreateSession} disabled={creating} className="btn-game" style={{ fontSize: "0.95rem", padding: "12px 28px", width: "auto" }}>
              {creating ? "Aanmaken…" : "+ Nieuwe sessie"}
            </button>
            {createError && <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>{createError}</p>}
          </div>
        )}

        {/* Overige sessies (geen actieve) */}
        {!activeSession && otherSessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p className="card-title">Sessies</p>
            {otherSessions.map((session) => (
              <div key={session.code} className="card" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px" }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: statusColor[session.status] ?? "var(--muted)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: "0.95rem", letterSpacing: "0.06em" }}>{session.code}</span>
                  <span style={{ color: "var(--muted)", fontSize: "0.78rem", marginLeft: "10px" }}>{statusLabel[session.status] ?? session.status}</span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Toggle session={session} onToggle={() => handleToggleActive(session)} />
                  <button onClick={() => handleDeleteSession(session.code)} title="Verwijderen"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "8px", border: "1px solid rgba(255,59,92,0.3)", background: "rgba(255,59,92,0.06)", color: "var(--red)", cursor: "pointer", fontSize: "1rem" }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: "4px" }}>
              <button onClick={handleCreateSession} disabled={creating}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 18px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, fontFamily: "var(--font)" }}>
                {creating ? "Aanmaken…" : "+ Nieuwe sessie"}
              </button>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
