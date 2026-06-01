"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, getDocs, getDoc, deleteDoc, doc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import QRCode from "qrcode";
import { auth, db } from "@/lib/firebase";
import AdminLayout from "./AdminLayout";

interface SessionDoc {
  code: string;
  status: string;
  state: string;
  quiz_id: string;
  is_active?: boolean;
  question_order?: string[];
  current_question_id?: string | null;
}

interface PlayerDoc { id: string; name: string; score: number; }
interface QDoc { id: string; round: number; order: number; }

export default function AdminDashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [playerCounts, setPlayerCounts] = useState<Record<string, number>>({});
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState("");
  const [globalLoading, setGlobalLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
  const [leaderboard, setLeaderboard] = useState<PlayerDoc[]>([]);
  const [lbCode, setLbCode] = useState<string | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<QDoc[]>([]);
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const qrGenerated = useRef<Set<string>>(new Set());
  const lbUnsubRef = useRef<(() => void) | null>(null);

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

      // Subscribe leaderboard van actieve sessie
      const active = docs.find((s) => s.is_active && s.status !== "finished");
      if (active && active.code !== lbCode) {
        lbUnsubRef.current?.();
        setLbCode(active.code);
        lbUnsubRef.current = onSnapshot(
          collection(db, "sessions", active.code, "players"),
          (psnap) => {
            const ps: PlayerDoc[] = psnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlayerDoc, "id">) }));
            ps.sort((a, b) => b.score - a.score);
            setLeaderboard(ps.slice(0, 5));
          }
        );
      } else if (!active) {
        lbUnsubRef.current?.();
        lbUnsubRef.current = null;
        setLbCode(null);
        setLeaderboard([]);
      }
    });
    return () => { unsub(); lbUnsubRef.current?.(); };
  }, [authChecked]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Laad vragen + ronde-namen voor de actieve sessie in lobby
  const activeLobby = sessions.find((s) => s.is_active && s.state === "lobby");
  useEffect(() => {
    const qid = activeLobby?.quiz_id;
    if (!qid) { setActiveQuestions([]); return; }
    (async () => {
      const [qsnap, quizSnap] = await Promise.all([
        getDocs(collection(db, "quizzes", qid, "questions")),
        getDoc(doc(db, "quizzes", qid)),
      ]);
      const qs = qsnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QDoc, "id">) }));
      qs.sort((a, b) => (a.round - b.round) || (a.order - b.order));
      setActiveQuestions(qs);
      setRoundNames((quizSnap.data()?.round_names as Record<string, string>) ?? {});
    })();
  }, [activeLobby?.quiz_id]);

  async function dashSelectRound(s: SessionDoc, r: number | "all") {
    const ids = (r === "all" ? activeQuestions : activeQuestions.filter((q) => q.round === r)).map((q) => q.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    await updateDoc(doc(db, "sessions", s.code), { question_order: ids, current_question_id: null, question_index: 0 });
  }

  async function dashStart(s: SessionDoc) {
    setStarting(true);
    const order = s.question_order && s.question_order.length > 0 ? s.question_order : activeQuestions.map((q) => q.id);
    if (order.length === 0) { setStarting(false); return; }
    await updateDoc(doc(db, "sessions", s.code), {
      state: "question_open", status: "active",
      current_question_id: order[0], question_index: 0,
      question_order: order, question_opened_at: serverTimestamp(),
    });
    setStarting(false);
  }

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
    sessions.filter((s) => s.status === "active")
      .forEach((s) => batch.update(doc(db, "sessions", s.code), { state: "endscreen", status: "finished" }));
    await batch.commit();
    setGlobalLoading(false);
  }

  async function handleSeedStandaard() {
    const user = auth.currentUser;
    if (!user) return;
    setSeedLoading(true); setSeedMsg("");
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
  const medals = ["🥇", "🥈", "🥉", "4.", "5."];

  if (!authChecked) return null;

  const activeSessions = sessions.filter((s) => s.status === "active");
  const activeSession = sessions.find((s) => s.is_active && s.status !== "finished");
  const dashRounds = [...new Set(activeQuestions.map((q) => q.round))].sort((a, b) => a - b);
  const dashRoundLabel = (r: number) => roundNames[r] ? roundNames[r] : `Ronde ${r}`;
  const dashSelected: number | "all" = (() => {
    const ord = activeLobby?.question_order;
    if (!ord?.length) return "all";
    const rs = new Set(ord.map((id) => activeQuestions.find((q) => q.id === id)?.round).filter((r) => r !== undefined));
    return rs.size === 1 ? ([...rs][0] as number) : "all";
  })();
  const dashSelectedCount = activeLobby?.question_order?.length ?? activeQuestions.length;

  return (
    <AdminLayout title="Dashboard">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "700px" }}>

        {/* Nieuwe sessie */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button onClick={handleCreateSession} disabled={creating} className="btn-game" style={{ flex: "0 0 auto", fontSize: "0.95rem", padding: "12px 20px" }}>
            {creating ? "Aanmaken..." : "+ Nieuwe sessie"}
          </button>
          {createError && <p style={{ color: "var(--red)", fontSize: "0.85rem", alignSelf: "center" }}>{createError}</p>}
        </div>

        {/* Ronde kiezen + starten voor actieve lobby-sessie */}
        {activeLobby && dashRounds.length > 0 && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "18px 20px", border: "1px solid rgba(0,217,255,0.25)" }}>
            <span style={{ color: "var(--cyan)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Start sessie {activeLobby.code} — kies vragen
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button onClick={() => dashSelectRound(activeLobby, "all")}
                style={{ padding: "8px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                  background: dashSelected === "all" ? "var(--cyan)" : "rgba(255,255,255,0.06)", color: dashSelected === "all" ? "#000" : "var(--text)" }}>
                Hele quiz ({activeQuestions.length})
              </button>
              {dashRounds.map((r) => (
                <button key={r} onClick={() => dashSelectRound(activeLobby, r)}
                  style={{ padding: "8px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                    background: dashSelected === r ? "var(--cyan)" : "rgba(255,255,255,0.06)", color: dashSelected === r ? "#000" : "var(--text)" }}>
                  {dashRoundLabel(r)} ({activeQuestions.filter((q) => q.round === r).length})
                </button>
              ))}
            </div>
            <button onClick={() => dashStart(activeLobby)} disabled={starting || dashSelectedCount === 0} className="btn-game" style={{ fontSize: "0.95rem", padding: "12px" }}>
              {starting ? "Starten..." : `🚀 Start (${dashSelectedCount} vragen)`}
            </button>
          </div>
        )}

        {/* Leaderboard actieve sessie */}
        {activeSession && leaderboard.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <p style={{ color: "var(--muted)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Live stand — {activeSession.code}
              </p>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--green)", display: "inline-block", animation: "pulse 1.5s infinite" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {leaderboard.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: i === 0 ? "rgba(255,217,59,0.08)" : "rgba(255,255,255,0.04)", borderRadius: "10px", border: `1px solid ${i === 0 ? "rgba(255,217,59,0.3)" : "rgba(255,255,255,0.08)"}` }}>
                  <span style={{ fontSize: "1rem", width: "24px", textAlign: "center" }}>{medals[i]}</span>
                  <span style={{ flex: 1, color: "#fff", fontWeight: 600, fontSize: "0.9rem" }}>{p.name}</span>
                  <span style={{ color: "var(--cyan)", fontWeight: 900, fontSize: "0.95rem" }}>{p.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toggle fout melding */}
        {toggleError && (
          <div style={{ color: "var(--red)", background: "rgba(255,59,92,0.1)", border: "1px solid rgba(255,59,92,0.3)", borderRadius: "10px", padding: "10px 16px", fontSize: "0.85rem" }}>
            ⚠ {toggleError}
            <button onClick={() => setToggleError("")} style={{ marginLeft: "10px", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.8rem" }}>✕</button>
          </div>
        )}

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
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "4px 0" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor[session.status] ?? "var(--muted)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: "var(--cyan)", fontWeight: 900, fontSize: "1.1rem", letterSpacing: "0.1em" }}>{session.code}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem", marginLeft: "10px" }}>
                      {statusLabel[session.status] ?? session.status} · {playerCounts[session.code] ?? 0} spelers
                    </span>
                  </div>

                  {/* Gekoppelde knoppengroep */}
                  <div style={{ display: "flex", flexShrink: 0, borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)" }}>
                    <button onClick={() => handleToggleActive(session)} disabled={!!toggling} title={session.is_active ? "Zet inactief" : "Zet actief"}
                      style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 12px", background: session.is_active ? "rgba(0,217,255,0.15)" : "rgba(255,255,255,0.05)", border: "none", borderRight: "1px solid rgba(255,255,255,0.14)", color: session.is_active ? "var(--cyan)" : "var(--muted)", fontSize: "0.78rem", fontWeight: 700, cursor: toggling ? "not-allowed" : "pointer", transition: "background 0.2s, color 0.2s", whiteSpace: "nowrap" }}>
                      <div style={{ width: "28px", height: "16px", borderRadius: "8px", background: session.is_active ? "var(--cyan)" : "rgba(255,255,255,0.2)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <div style={{ position: "absolute", top: "2px", left: session.is_active ? "14px" : "2px", width: "12px", height: "12px", borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                      </div>
                      {session.is_active ? "Actief" : "Inactief"}
                    </button>
                    <a href={`/admin/sessie/${session.code}`} style={{ display: "flex", alignItems: "center", padding: "7px 14px", background: "rgba(255,255,255,0.05)", borderRight: "1px solid rgba(255,255,255,0.14)", color: "var(--cyan)", fontSize: "0.78rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                      Beheren →
                    </a>
                    <button onClick={() => handleDeleteSession(session.code)} title="Verwijderen"
                      style={{ display: "flex", alignItems: "center", padding: "7px 11px", background: "rgba(255,255,255,0.05)", border: "none", color: "var(--red)", fontSize: "0.9rem", cursor: "pointer", opacity: 0.7 }}>
                      ✕
                    </button>
                  </div>
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
