"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, getDocs, deleteDoc, doc, updateDoc } from "firebase/firestore";
import QRCode from "qrcode";
import { auth, db } from "@/lib/firebase";
import AdminLayout from "./AdminLayout";

interface SessionDoc {
  code: string;
  status: string;
  state: string;
  quiz_id: string;
  is_active?: boolean;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const qrGenerated = useRef<Set<string>>(new Set());

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

  // Generate QR codes for active sessions
  useEffect(() => {
    sessions.forEach(async (s) => {
      if (s.is_active && !qrGenerated.current.has(s.code)) {
        qrGenerated.current.add(s.code);
        const url = `${window.location.origin}/speel/${s.code}`;
        const dataUrl = await QRCode.toDataURL(url, { width: 160, margin: 1, color: { dark: "#ffffff", light: "#00000000" } });
        setQrUrls((prev) => ({ ...prev, [s.code]: dataUrl }));
      }
    });
  }, [sessions]);

  async function handleCreateSession() {
    setCreating(true);
    setCreateError("");
    const user = auth.currentUser;
    if (!user) { router.push("/admin/login"); return; }
    const token = await user.getIdToken();
    const res = await fetch("/api/host/sessie", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ concept: true }),
    });
    const json = await res.json();
    if (!res.ok) { setCreateError(json.error ?? "Er ging iets fout"); setCreating(false); return; }
    setCreating(false);
  }

  async function handleDeleteSession(code: string) {
    if (!confirm(`Sessie ${code} verwijderen?`)) return;
    await deleteDoc(doc(db, "sessions", code));
  }

  async function handleToggleActive(session: SessionDoc) {
    setToggling(session.code);
    const newActive = !session.is_active;
    await updateDoc(doc(db, "sessions", session.code), { is_active: newActive });
    setToggling(null);
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
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "700px" }}>

        {/* Nieuwe sessie */}
        <div>
          <button onClick={handleCreateSession} disabled={creating} className="btn-game">
            {creating ? "Aanmaken..." : "+ Nieuwe sessie"}
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
              <div
                key={session.code}
                className="card"
                style={{ display: "flex", flexDirection: "column", gap: "12px" }}
              >
                {/* Header rij */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ color: "var(--cyan)", fontWeight: 900, fontSize: "1.2rem", letterSpacing: "0.12em" }}>
                      {session.code}
                    </span>
                    <span style={{ color: statusColor[session.status] ?? "var(--muted)", fontSize: "0.82rem", fontWeight: 600 }}>
                      {statusLabel[session.status] ?? session.status}
                      {" · "}
                      <span style={{ color: "var(--muted)" }}>{playerCounts[session.code] ?? 0} spelers</span>
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {/* Toggle actief */}
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <span style={{ color: "var(--muted)", fontSize: "0.8rem", fontWeight: 600 }}>
                        {session.is_active ? "Actief" : "Inactief"}
                      </span>
                      <div
                        onClick={() => !toggling && handleToggleActive(session)}
                        style={{
                          width: "44px", height: "24px", borderRadius: "12px",
                          background: session.is_active ? "var(--cyan)" : "rgba(255,255,255,0.15)",
                          position: "relative", cursor: toggling ? "not-allowed" : "pointer",
                          transition: "background 0.2s", opacity: toggling === session.code ? 0.5 : 1,
                        }}
                      >
                        <div style={{
                          position: "absolute", top: "3px",
                          left: session.is_active ? "23px" : "3px",
                          width: "18px", height: "18px", borderRadius: "50%",
                          background: "#fff", transition: "left 0.2s",
                        }} />
                      </div>
                    </label>

                    {/* Beheren */}
                    <a
                      href={`/admin/sessie/${session.code}`}
                      style={{ color: "var(--cyan)", fontSize: "0.85rem", fontWeight: 700, textDecoration: "none" }}
                    >
                      Beheren →
                    </a>

                    {/* Verwijderen */}
                    <button
                      onClick={() => handleDeleteSession(session.code)}
                      style={{ color: "var(--red)", background: "none", border: "none", cursor: "pointer", fontSize: "1rem", opacity: 0.6, padding: "4px 8px" }}
                      title="Verwijderen"
                    >✕</button>
                  </div>
                </div>

                {/* QR code bij actieve sessie */}
                {session.is_active && (
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    {qrUrls[session.code] ? (
                      <img src={qrUrls[session.code]} alt="QR code" style={{ width: "80px", height: "80px", borderRadius: "8px", background: "rgba(255,255,255,0.1)" }} />
                    ) : (
                      <div style={{ width: "80px", height: "80px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>QR...</span>
                      </div>
                    )}
                    <div>
                      <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>Scan om mee te doen</p>
                      <p style={{ color: "#fff", fontWeight: 700, fontSize: "1rem", letterSpacing: "0.1em" }}>{session.code}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
