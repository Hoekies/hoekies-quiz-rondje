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
import { auth, db } from "@/lib/firebase";
import type { SessionState } from "@/types/database";

interface SessionDoc {
  quiz_id: string;
  code: string;
  status: string;
  state: SessionState;
  current_question_id: string | null;
  question_index: number;
  question_order?: string[];
  started_at: unknown;
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
        });
        break;
      case "question_open":
        patchSession("answer_reveal");
        break;
      case "answer_reveal":
        patchSession("leaderboard");
        break;
      case "leaderboard":
        if (isLastQuestion) {
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
          });
        }
        break;
      case "finale":
        patchSession("question_open", {
          current_question_id: currentQuestion?.id ?? null,
        });
        break;
    }
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
    endscreen: "Quiz afgerond",
  };

  if (loading) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-white/60">Laden...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-white/60">Sessie niet gevonden.</p>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "var(--game-gradient)" }}
    >
      <div className="w-full max-w-2xl flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-black text-2xl tracking-tight">
              Sessie <span style={{ color: "var(--cyan)" }}>{code}</span>
            </h1>
            <p className="text-white/40 text-sm mt-0.5 capitalize">
              {session.state.replace(/_/g, " ")}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={`/qr/${code}`}
              target="_blank"
              className="text-xs px-3 py-2 rounded-lg font-semibold text-white/60 hover:text-white border border-white/20 hover:border-white/40 transition-all"
            >
              QR ↗
            </a>
            <a
              href={`/presentatie/${code}`}
              target="_blank"
              className="text-xs px-3 py-2 rounded-lg font-semibold text-white/60 hover:text-white border border-white/20 hover:border-white/40 transition-all"
            >
              Presentatie ↗
            </a>
          </div>
        </div>

        {/* QR code in lobby */}
        {session.state === "lobby" && qrDataUrl && (
          <div
            className="rounded-2xl p-6 flex flex-col items-center gap-3"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}
          >
            <p className="text-white/70 text-sm font-semibold">Scan om mee te doen</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code" width={180} height={180} className="rounded-xl" />
            <p className="text-white/40 text-xs">
              {typeof window !== "undefined" ? `${window.location.origin}/speel/${code}` : ""}
            </p>
          </div>
        )}

        {/* Vraag + spelers naast elkaar op brede schermen */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Huidige vraag */}
          {currentQuestion && (
            <div
              className="rounded-2xl p-5 flex flex-col gap-3"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-xs uppercase tracking-wider font-bold">
                  Vraag {currentIdx + 1} / {questionOrder.length}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: "rgba(6,182,212,0.2)", color: "var(--cyan)" }}
                >
                  {currentQuestion.type}
                </span>
              </div>
              <p className="text-white font-bold text-base leading-snug">
                {currentQuestion.question_text}
              </p>
              <p className="text-green-400 text-sm font-bold">
                ✓ {currentQuestion.correct_answer}
              </p>
              {session.state === "question_open" && (
                <div
                  className="flex items-center gap-2 mt-1 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <span className="text-white/50 text-sm">Antwoorden</span>
                  <span className="text-white font-black text-lg ml-auto">{answerCount}</span>
                  <span className="text-white/40 text-sm">/ {players.length}</span>
                </div>
              )}
            </div>
          )}

          {/* Spelers */}
          <div
            className="rounded-2xl p-5 flex flex-col gap-2"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <p className="text-white/40 text-xs uppercase tracking-wider font-bold mb-1">
              Spelers ({players.length})
            </p>
            {players.length === 0 ? (
              <p className="text-white/30 text-sm">Nog geen spelers...</p>
            ) : (
              <>
                {players.slice(0, 10).map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-white/30 w-5 text-xs">{i + 1}</span>
                    <span className="text-white/80 flex-1">{p.name}</span>
                    <span className="font-bold" style={{ color: "var(--cyan)" }}>{p.score}</span>
                  </div>
                ))}
                {players.length > 10 && (
                  <p className="text-white/30 text-xs mt-1">+{players.length - 10} meer</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Error */}
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* Actieknop */}
        {session.state !== "endscreen" ? (
          <button
            onClick={handleAction}
            disabled={actionLoading}
            className="w-full py-5 rounded-2xl font-black text-white text-2xl transition-all active:scale-95 disabled:opacity-60"
            style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}
          >
            {actionLoading ? "..." : (actionLabel[session.state] ?? "Volgende")}
          </button>
        ) : (
          <div className="text-center py-6">
            <p className="text-white text-2xl font-black">Quiz afgerond! 🏆</p>
            <a href="/admin" className="text-white/50 text-sm mt-2 block hover:text-white/80">
              Terug naar dashboard
            </a>
          </div>
        )}

        {/* Reset knop */}
        <button
          onClick={handleReset}
          disabled={actionLoading}
          className="w-full py-3 rounded-2xl font-bold text-white/60 text-sm transition-all active:scale-95 disabled:opacity-40 hover:text-white border border-white/20 hover:border-red-400/50 hover:text-red-400"
        >
          Sessie resetten (scores op 0)
        </button>
      </div>
    </main>
  );
}
