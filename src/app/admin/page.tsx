"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "firebase/firestore";
import QRCode from "qrcode";
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
  const [headerQr, setHeaderQr] = useState("");

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

  // QR voor de actieve sessie (in de header)
  useEffect(() => {
    const act = sessions.find((s) => s.is_active && s.status !== "finished");
    if (!act) { setHeaderQr(""); return; }
    QRCode.toDataURL(`https://hoekies-quiz-rondje.vercel.app/speel/${act.code}`, { width: 160, margin: 1, color: { dark: "#ffffff", light: "#00000000" } })
      .then(setHeaderQr).catch(() => {});
  }, [sessions]);

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

  return (
    <AdminLayout title="Dashboard">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "700px" }}>

        {/* Actieve sessie — compacte header */}
        {activeSession && (
          <div className="card" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor[activeSession.status] ?? "var(--muted)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: "var(--cyan)", fontWeight: 900, fontSize: "1.2rem", letterSpacing: "0.1em" }}>{activeSession.code}</span>
              <span style={{ color: "var(--muted)", fontSize: "0.8rem", marginLeft: "10px" }}>
                {statusLabel[activeSession.status] ?? activeSession.status}
              </span>
            </div>

            {activeSession.is_active && headerQr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headerQr} alt="QR" style={{ width: "56px", height: "56px", borderRadius: "8px", background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
            )}

            <div style={{ display: "flex", flexShrink: 0, borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
              <button onClick={() => handleToggleActive(activeSession)} disabled={!!toggling} title={activeSession.is_active ? "Zet inactief" : "Zet actief"}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", background: activeSession.is_active ? "rgba(13,180,171,0.15)" : "rgba(255,255,255,0.05)", border: "none", borderRight: "1px solid rgba(255,255,255,0.14)", color: activeSession.is_active ? "var(--cyan)" : "var(--muted)", fontSize: "0.78rem", fontWeight: 700, cursor: toggling ? "not-allowed" : "pointer", transition: "background 0.2s, color 0.2s", whiteSpace: "nowrap" }}>
                <div style={{ width: "28px", height: "16px", borderRadius: "8px", background: activeSession.is_active ? "var(--cyan)" : "rgba(255,255,255,0.2)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: "2px", left: activeSession.is_active ? "14px" : "2px", width: "12px", height: "12px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </div>
                {activeSession.is_active ? "Actief" : "Inactief"}
              </button>
              <button onClick={() => handleDeleteSession(activeSession.code)} title="Verwijderen"
                style={{ display: "flex", alignItems: "center", padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "none", color: "var(--red)", fontSize: "0.9rem", cursor: "pointer", opacity: 0.7 }}>
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Live besturing van de actieve sessie — alles-in-één */}
        {activeSession && (
          <div style={{ paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <SessionControl code={activeSession.code} />
          </div>
        )}

        {/* Toggle fout melding */}
        {toggleError && (
          <div style={{ color: "var(--red)", background: "rgba(255,59,92,0.1)", border: "1px solid rgba(255,59,92,0.3)", borderRadius: "10px", padding: "10px 16px", fontSize: "0.85rem" }}>
            ⚠ {toggleError}
            <button onClick={() => setToggleError("")} style={{ marginLeft: "10px", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
          </div>
        )}

        {/* Nieuwe sessie — alleen tonen als er nog geen sessie bestaat */}
        {sessions.length === 0 && (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button onClick={handleCreateSession} disabled={creating} className="btn-game" style={{ flex: "0 0 auto", fontSize: "0.95rem", padding: "12px 20px" }}>
              {creating ? "Aanmaken..." : "+ Nieuwe sessie"}
            </button>
            {createError && <p style={{ color: "var(--red)", fontSize: "0.85rem", alignSelf: "center" }}>{createError}</p>}
          </div>
        )}

        {/* Overige sessies — compacte rij om te activeren/starten (alleen als er geen actieve sessie is) */}
        {!activeSession && otherSessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.02em" }}>
              Sessies ({otherSessions.length})
            </p>
            {otherSessions.map((session) => (
              <div key={session.code} className="card" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor[session.status] ?? "var(--muted)", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: "var(--cyan)", fontWeight: 900, fontSize: "1rem", letterSpacing: "0.1em" }}>{session.code}</span>
                  <span style={{ color: "var(--muted)", fontSize: "0.78rem", marginLeft: "10px" }}>
                    {statusLabel[session.status] ?? session.status}
                  </span>
                </div>
                <div style={{ display: "flex", flexShrink: 0, borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
                  <button onClick={() => handleToggleActive(session)} disabled={!!toggling} title="Activeren"
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", background: "rgba(255,255,255,0.05)", border: "none", borderRight: "1px solid rgba(255,255,255,0.14)", color: "var(--muted)", fontSize: "0.78rem", fontWeight: 700, cursor: toggling ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                    <div style={{ width: "28px", height: "16px", borderRadius: "8px", background: "rgba(255,255,255,0.2)", position: "relative", flexShrink: 0 }}>
                      <div style={{ position: "absolute", top: "2px", left: "2px", width: "12px", height: "12px", borderRadius: "50%", background: "#fff" }} />
                    </div>
                    Activeren
                  </button>
                  <button onClick={() => handleDeleteSession(session.code)} title="Verwijderen"
                    style={{ display: "flex", alignItems: "center", padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "none", color: "var(--red)", fontSize: "0.9rem", cursor: "pointer", opacity: 0.7 }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
