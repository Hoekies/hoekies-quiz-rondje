"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, getDocs, deleteDoc, doc, updateDoc, writeBatch } from "firebase/firestore";
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
  const [globalLoading, setGlobalLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
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

  useEffect(() => {
    sessions.forEach(async (s) => {
      if (s.is_active && !qrGenerated.current.has(s.code)) {
        qrGenerated.current.add(s.code);
        const url = `https://hoekies-quiz-rondje.vercel.app/speel/${s.code}`;
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
    await updateDoc(doc(db, "sessions", session.code), { is_active: !session.is_active });
    setToggling(null);
  }

  async function handleAlleInactief() {
    if (!confirm("Alle sessies op inactief zetten?")) return;
    setGlobalLoading(true);
    const batch = writeBatch(db);
    sessions.forEach((s) => batch.update(doc(db, "sessions", s.code), { is_active: false }));
    await batch.commit();
    setGlobalLoading(false);
  }

  async function handleAlleStoppen() {
    if (!confirm("Alle actieve sessies stoppen (eindscherm)?")) return;
    setGlobalLoading(true);
    const batch = writeBatch(db);
    sessions
      .filter((s) => s.status === "active")
      .forEach((s) => batch.update(doc(db, "sessions", s.code), { state: "endscreen", status: "finished" }));
    await batch.commit();
    setGlobalLoading(false);
  }

  async function handleSeedStandaard() {
    const user = auth.currentUser;
    if (!user) return;
    setSeedLoading(true);
    setSeedMsg("");
    const token = await user.getIdToken();
    const res = await fetch("/api/host/vragen/seed-standaard", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setSeedMsg(res.ok ? `✓ ${json.message}` : `✕ ${json.error ?? "Fout"}`);
    setSeedLoading(false);
  }

  const statusLabel: Record<string, string> = { lobby: "Wacht op spelers", active: "Bezig", finished: "Afgerond" };
  const statusColor: Record<string, string> = { lobby: "var(--cyan)", active: "var(--green)", finished: "var(--muted)" };

  if (!authChecked) return null;

  const activeSessions = sessions.filter((s) => s.status === "active");

  return (
    <AdminLayout title="Dashboard">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "700px" }}>

        {/* Acties bovenste rij */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button onClick={handleCreateSession} disabled={creating} className="btn-game" style={{ flex: "0 0 auto", fontSize: "0.95rem", padding: "12px 20px" }}>
            {creating ? "Aanmaken..." : "+ Nieuwe sessie"}
          </button>
          {createError && <p style={{ color: "var(--red)", fontSize: "0.85rem", alignSelf: "center" }}>{createError}</p>}
        </div>

        {/* Globale sessie-acties */}
        {sessions.length > 0 && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", padding: "14px 16px", background: "rgba(255,255,255,0.04)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", alignSelf: "center", marginRight: "4px" }}>Alle sessies:</span>
            <button onClick={handleAlleInactief} disabled={globalLoading}
              style={{ fontSize: "0.82rem", fontWeight: 700, padding: "6px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "var(--text)", cursor: "pointer" }}>
              Inactief zetten
            </button>
            <button onClick={handleAlleStoppen} disabled={globalLoading || activeSessions.length === 0}
              style={{ fontSize: "0.82rem", fontWeight: 700, padding: "6px 14px", borderRadius: "8px", border: "1px solid rgba(255,107,107,0.4)", background: "transparent", color: activeSessions.length === 0 ? "var(--muted)" : "var(--red)", cursor: activeSessions.length === 0 ? "default" : "pointer" }}>
              {activeSessions.length > 0 ? `${activeSessions.length} sessie${activeSessions.length > 1 ? "s" : ""} stoppen` : "Geen actieve sessies"}
            </button>
          </div>
        )}

        {/* Sessies */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Sessies ({sessions.length})
          </p>

          {sessions.length === 0 ? (
            <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: "32px" }}>
              Nog geen sessies. Maak een nieuwe aan!
            </div>
          ) : (
            sessions.map((session) => (
              <div key={session.code} className="card" style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {/* Hoofd-rij */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "4px 0" }}>
                  {/* Status-dot */}
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor[session.status] ?? "var(--muted)", flexShrink: 0 }} />

                  {/* Code + status */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: "var(--cyan)", fontWeight: 900, fontSize: "1.1rem", letterSpacing: "0.1em" }}>{session.code}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem", marginLeft: "10px" }}>
                      {statusLabel[session.status] ?? session.status} · {playerCounts[session.code] ?? 0} spelers
                    </span>
                  </div>

                  {/* Toggle actief/inactief */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    <span style={{ color: session.is_active ? "var(--cyan)" : "var(--muted)", fontSize: "0.75rem", fontWeight: 700, minWidth: "46px", textAlign: "right" }}>
                      {session.is_active ? "Actief" : "Inactief"}
                    </span>
                    <div onClick={() => !toggling && handleToggleActive(session)}
                      style={{ width: "40px", height: "22px", borderRadius: "11px", background: session.is_active ? "var(--cyan)" : "rgba(255,255,255,0.15)", position: "relative", cursor: toggling ? "not-allowed" : "pointer", transition: "background 0.2s", flexShrink: 0, opacity: toggling === session.code ? 0.5 : 1 }}>
                      <div style={{ position: "absolute", top: "3px", left: session.is_active ? "21px" : "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                    </div>
                  </div>

                  {/* Acties */}
                  <a href={`/admin/sessie/${session.code}`}
                    style={{ color: "var(--cyan)", fontSize: "0.82rem", fontWeight: 700, textDecoration: "none", flexShrink: 0, padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(0,217,255,0.3)", background: "rgba(0,217,255,0.05)" }}>
                    Beheren →
                  </a>
                  <button onClick={() => handleDeleteSession(session.code)}
                    style={{ color: "var(--red)", background: "none", border: "none", cursor: "pointer", fontSize: "1rem", opacity: 0.5, padding: "4px", flexShrink: 0 }}
                    title="Verwijderen">✕</button>
                </div>

                {/* QR bij actieve sessie */}
                {session.is_active && (
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingTop: "10px", marginTop: "4px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    {qrUrls[session.code]
                      ? <img src={qrUrls[session.code]} alt="QR" style={{ width: "70px", height: "70px", borderRadius: "8px", background: "rgba(255,255,255,0.08)" }} />
                      : <div style={{ width: "70px", height: "70px", borderRadius: "8px", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ color: "var(--muted)", fontSize: "0.65rem" }}>QR...</span>
                        </div>}
                    <div>
                      <p style={{ color: "var(--muted)", fontSize: "0.72rem" }}>Scan om mee te doen</p>
                      <p style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem", letterSpacing: "0.1em" }}>{session.code}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Standaard quizzen */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Standaard quizzen</p>
          <p style={{ color: "var(--text)", fontSize: "0.85rem" }}>Laad 3 kant-en-klare quizzen: Sport, Algemene Kennis en Muziek (alle jaren 90/2000, 20 vragen elk).</p>
          <button onClick={handleSeedStandaard} disabled={seedLoading}
            style={{ alignSelf: "flex-start", fontSize: "0.88rem", fontWeight: 700, padding: "10px 18px", borderRadius: "10px", border: "1px solid rgba(0,217,255,0.35)", background: "rgba(0,217,255,0.07)", color: "var(--cyan)", cursor: seedLoading ? "not-allowed" : "pointer" }}>
            {seedLoading ? "Bezig..." : "Standaard quizzen importeren"}
          </button>
          {seedMsg && <p style={{ color: seedMsg.startsWith("✓") ? "var(--green)" : "var(--red)", fontSize: "0.85rem" }}>{seedMsg}</p>}
        </div>

      </div>
    </AdminLayout>
  );
}
