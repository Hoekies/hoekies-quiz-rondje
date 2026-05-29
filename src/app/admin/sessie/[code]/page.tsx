"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { SessionState } from "@/types/database";
import AdminLayout from "../../AdminLayout";

interface SessionDoc {
  quiz_id: string;
  code: string;
  status: string;
  state: SessionState;
  current_question_id: string | null;
  question_index: number;
  question_order?: string[];
  started_at: unknown;
  resume_at?: { seconds: number } | null;
  force_end?: boolean;
}

interface QuestionDoc {
  id: string;
  round: number;
  order: number;
  type: string;
  question_text: string;
  correct_answer: string;
  is_double_points: boolean;
  base_points: number;
  time_limit_seconds: number;
}

interface PlayerDoc {
  id: string;
  name: string;
  score: number;
}

export default function HostControlPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [answerCount, setAnswerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.push("/admin/login");
    });
    return unsub;
  }, [router]);

  // Generate QR code
  useEffect(() => {
    (async () => {
      try {
        const mod = await import("qrcode");
        const url = `${window.location.origin}/speel/${code}`;
        const dataUrl = await mod.toDataURL(url, { width: 200, margin: 2 });
        setQrDataUrl(dataUrl);
      } catch {}
    })();
  }, [code]);

  // Subscribe to session doc
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "sessions", code), (snap) => {
      if (snap.exists()) {
        setSession({ ...(snap.data() as SessionDoc), code: snap.id });
      }
      setLoading(false);
    });
    return unsub;
  }, [code]);

  // Load questions when we have quiz_id
  useEffect(() => {
    if (!session?.quiz_id) return;

    const unsub = onSnapshot(
      collection(db, "quizzes", session.quiz_id, "questions"),
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<QuestionDoc, "id">) }))
          .sort((a, b) => a.round !== b.round ? a.round - b.round : a.order - b.order);
        setQuestions(docs);
      }
    );
    return unsub;
  }, [session?.quiz_id]);

  // Subscribe to players
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "sessions", code, "players"),
      (snap) => {
        const ps = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PlayerDoc, "id">),
        }));
        ps.sort((a, b) => b.score - a.score);
        setPlayers(ps);
      }
    );
    return unsub;
  }, [code]);

  // Na endscreen: terug naar dashboard
  useEffect(() => {
    if (session?.state === "endscreen") {
      const t = setTimeout(() => router.push("/admin"), 3000);
      return () => clearTimeout(t);
    }
  }, [session?.state, router]);

  // Na resuming: automatisch question_open na 10,5 seconden
  useEffect(() => {
    if (session?.state !== "resuming") return;
    const t = setTimeout(() => {
      updateDoc(doc(db, "sessions", code), { state: "question_open", status: "active" }).catch(console.error);
    }, 10500);
    return () => clearTimeout(t);
  }, [session?.state, code]);

  // Subscribe to answers for current question
  useEffect(() => {
    setAnswerCount(0);
    if (!session?.current_question_id) return;

    const q = query(
      collection(db, "sessions", code, "answers"),
      where("question_id", "==", session.current_question_id)
    );

    const unsub = onSnapshot(q, (snap) => {
      setAnswerCount(snap.size);
    });
    return unsub;
  }, [code, session?.current_question_id]);

  async function patchSession(
    state: SessionState,
    extra?: Record<string, unknown>
  ) {
    setActionLoading(true);
    setError("");

    let status: string;
    if (state === "lobby") status = "lobby";
    else if (state === "endscreen") status = "finished";
    else status = "active";

    try {
      await updateDoc(doc(db, "sessions", code), { state, status, ...extra });
    } catch (err) {
      console.error(err);
      setError("Fout bij updaten — controleer of je ingelogd bent als admin");
    }
    setActionLoading(false);
  }

  const currentQuestion = questions.find(
    (q) => q.id === session?.current_question_id
  );
  // Gebruik question_order voor willekeurige volgorde; val terug op gesorteerde lijst
  const questionOrder: string[] =
    session?.question_order && session.question_order.length > 0
      ? session.question_order
      : questions.map((q) => q.id);
  const currentIdx = questionOrder.indexOf(session?.current_question_id ?? "");
  const nextQuestionId = questionOrder[currentIdx + 1];
  const nextQuestion = questions.find((q) => q.id === nextQuestionId) ?? null;
  const isLastQuestion = currentIdx >= 0 && currentIdx === questionOrder.length - 1;

  async function handleReset() {
    if (!window.confirm("Sessie volledig resetten? Alle scores worden op 0 gezet en antwoorden gewist.")) return;
    setActionLoading(true);
    setError("");
    const user = auth.currentUser;
    if (!user) { router.push("/admin/login"); return; }
    const token = await user.getIdToken();
    const res = await fetch(`/api/host/sessie/${code}/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Fout bij resetten");
    setActionLoading(false);
  }

  function handleAction() {
    if (!session) return;
    switch (session.state) {
      case "lobby":
      case "ronde_intro":
        patchSession("question_open", {
          current_question_id: questionOrder[0] ?? null,
          question_index: 0,
          question_opened_at: serverTimestamp(),
        });
        break;
      case "question_open":
        patchSession("answer_reveal");
        break;
      case "answer_reveal":
        patchSession("leaderboard");
        break;
      case "leaderboard":
        if (isLastQuestion || session?.force_end) {
          patchSession("endscreen");
        } else if (nextQuestion?.is_double_points) {
          patchSession("finale", {
            current_question_id: nextQuestion.id,
            question_index: currentIdx + 1,
          });
        } else {
          patchSession("question_open", {
            current_question_id: nextQuestionId ?? null,
            question_index: currentIdx + 1,
            question_opened_at: serverTimestamp(),
          });
        }
        break;
      case "finale":
        patchSession("question_open", {
          current_question_id: currentQuestion?.id ?? null,
          question_opened_at: serverTimestamp(),
        });
        break;
      case "paused":
        patchSession("resuming", { resume_at: new Date() });
        break;
    }
  }

  function handlePause() {
    if (session?.state === "question_open") patchSession("paused");
  }

  async function handleToggleForceEnd() {
    if (!session) return;
    await updateDoc(doc(db, "sessions", code), { force_end: !session.force_end });
  }

  const nextLabel = isLastQuestion
    ? "Eindscherm"
    : nextQuestion?.is_double_points
    ? "🔥 Finale"
    : "➡ Volgende vraag";

  const actionLabel: Record<string, string> = {
    lobby: "🚀 Start quiz",
    ronde_intro: "🚀 Start quiz",
    question_open: "🔒 Sluit antwoorden",
    answer_reveal: "📊 Leaderboard",
    leaderboard: nextLabel,
    finale: "Toon finale vraag",
    paused: "▶ Hervat quiz",
    resuming: "⏱ Aftellen...",
    endscreen: "Quiz afgerond",
  };

  if (loading) return null;
  if (!session) return <AdminLayout title="Sessie"><p style={{ color: "var(--muted)" }}>Sessie niet gevonden.</p></AdminLayout>;

  const S = { display: "flex", flexDirection: "column" as const, gap: "20px", maxWidth: "720px" };

  return (
    <AdminLayout title={`Sessie ${code}`}>
      <div style={S}>

        {/* Links + status */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span className="status-pil status-pil--blauw" style={{ fontSize: "0.75rem" }}>
            {session.state.replace(/_/g, " ")}
          </span>
          <a href={`/qr/${code}`} target="_blank" className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "6px 14px" }}>QR ↗</a>
          <a href={`/presentatie/${code}`} target="_blank" className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "6px 14px" }}>Presentatie ↗</a>
        </div>

        {/* QR lobby */}
        {session.state === "lobby" && qrDataUrl && (
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "24px" }}>
            <p style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.9rem" }}>Scan om mee te doen</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code" width={180} height={180} style={{ borderRadius: "10px" }} />
            <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
              {typeof window !== "undefined" ? `${window.location.origin}/speel/${code}` : ""}
            </p>
          </div>
        )}

        {/* Vraag + spelers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          {currentQuestion && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Vraag {currentIdx + 1} / {questionOrder.length}
                </span>
                <span className="status-pil status-pil--blauw">{currentQuestion.type}</span>
              </div>
              <p style={{ color: "var(--ink)", fontWeight: 600, lineHeight: 1.4 }}>{currentQuestion.question_text}</p>
              <p style={{ color: "var(--green)", fontWeight: 700, fontSize: "0.9rem" }}>✓ {currentQuestion.correct_answer}</p>
              {session.state === "question_open" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.06)", padding: "10px 14px", borderRadius: "8px", marginTop: "4px" }}>
                  <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Antwoorden</span>
                  <span style={{ color: "var(--ink)", fontWeight: 900, fontSize: "1.2rem", marginLeft: "auto" }}>{answerCount}</span>
                  <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>/ {players.length}</span>
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
              Spelers ({players.length})
            </p>
            {players.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Nog geen spelers...</p>
            ) : players.slice(0, 10).map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
                <span style={{ color: "var(--muted)", width: "18px", fontSize: "0.75rem" }}>{i + 1}</span>
                <span style={{ color: "var(--text)", flex: 1 }}>{p.name}</span>
                <span style={{ color: "var(--cyan)", fontWeight: 700 }}>{p.score}</span>
              </div>
            ))}
            {players.length > 10 && <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>+{players.length - 10} meer</p>}
          </div>
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>{error}</p>}

        {/* Actie */}
        {session.state === "endscreen" ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ color: "var(--ink)", fontWeight: 900, fontSize: "1.5rem" }}>Quiz afgerond! 🏆</p>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "6px" }}>Je wordt doorgestuurd naar het dashboard...</p>
          </div>
        ) : session.state === "resuming" ? (
          <button disabled className="btn-game" style={{ fontSize: "1.15rem", opacity: 0.7 }}>
            ⏱ Aftellen tot start...
          </button>
        ) : (
          <button onClick={handleAction} disabled={actionLoading} className="btn-game" style={{ fontSize: "1.15rem" }}>
            {actionLoading ? "..." : (actionLabel[session.state] ?? "Volgende")}
          </button>
        )}

        {/* Pauze-knop — alleen tijdens question_open */}
        {session.state === "question_open" && (
          <button onClick={handlePause} disabled={actionLoading} className="btn btn-ghost" style={{ fontWeight: 700 }}>
            🍺 Pauzeer
          </button>
        )}

        {/* Stop na deze vraag — beschikbaar tijdens actieve sessie, niet op eindscherm */}
        {session.state !== "endscreen" && session.state !== "lobby" && session.state !== "resuming" && (
          <button
            onClick={handleToggleForceEnd}
            style={{
              fontWeight: 700, fontSize: "0.9rem", padding: "10px 16px", borderRadius: "10px",
              border: `2px solid ${session.force_end ? "#ff6b35" : "rgba(255,255,255,0.2)"}`,
              background: session.force_end ? "rgba(255,107,53,0.15)" : "transparent",
              color: session.force_end ? "#ff6b35" : "var(--muted)", cursor: "pointer",
            }}
          >
            {session.force_end ? "✓ Stopt na deze vraag" : "Stop na deze vraag"}
          </button>
        )}

        {session.state !== "endscreen" && session.state !== "resuming" && (
          <button onClick={handleReset} disabled={actionLoading} className="btn btn-danger" style={{ opacity: 0.6, fontSize: "0.85rem" }}>
            Sessie resetten (scores op 0)
          </button>
        )}
      </div>
    </AdminLayout>
  );
}
