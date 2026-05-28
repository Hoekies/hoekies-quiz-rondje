"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
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
  const tokenRef = useRef<string | null>(null);

  // Auth guard + store token
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/admin/login");
      } else {
        tokenRef.current = await user.getIdToken(true);
      }
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

    const user = auth.currentUser;
    if (!user) {
      router.push("/admin/login");
      return;
    }
    const token = await user.getIdToken(true);

    const res = await fetch(`/api/host/sessie/${code}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ state, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Fout bij updaten");
    setActionLoading(false);
  }

  const currentQuestion = questions.find(
    (q) => q.id === session?.current_question_id
  );
  const currentIndex = currentQuestion ? questions.indexOf(currentQuestion) : -1;
  const nextQuestion = questions[currentIndex + 1] ?? null;
  const isLastQuestion =
    currentIndex === questions.length - 1 && questions.length > 0;

  function handleAction() {
    if (!session) return;
    switch (session.state) {
      case "lobby":
        patchSession("ronde_intro", {
          current_question_id: questions[0]?.id ?? null,
          question_index: 0,
        });
        break;
      case "ronde_intro":
        patchSession("question_open", {
          current_question_id:
            currentQuestion?.id ?? questions[0]?.id ?? null,
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
            question_index: currentIndex + 1,
          });
        } else {
          patchSession("question_open", {
            current_question_id: nextQuestion?.id ?? null,
            question_index: currentIndex + 1,
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
    ronde_intro: "▶ Toon vraag",
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
      className="min-h-screen p-4"
      style={{ background: "var(--game-gradient)" }}
    >
      <div className="max-w-xl mx-auto flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white font-black text-xl">
              Sessie{" "}
              <span style={{ color: "var(--cyan)" }} className="tracking-widest">
                {code}
              </span>
            </h1>
            <p className="text-white/50 text-sm capitalize">
              {session.state.replace(/_/g, " ")}
            </p>
          </div>
          <a
            href={`/presentatie/${code}`}
            target="_blank"
            className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white/70 hover:text-white border border-white/20 hover:border-white/40 transition-all"
          >
            Presentatie ↗
          </a>
        </div>

        {/* QR code in lobby */}
        {session.state === "lobby" && qrDataUrl && (
          <div
            className="rounded-xl p-4 flex flex-col items-center gap-3"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <p className="text-white/70 text-sm font-semibold">
              Scan om mee te doen
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="QR code"
              width={160}
              height={160}
              className="rounded-lg"
            />
            <p className="text-white/50 text-xs">
              {typeof window !== "undefined"
                ? `${window.location.origin}/speel/${code}`
                : ""}
            </p>
          </div>
        )}

        {/* Current question info */}
        {currentQuestion && (
          <div
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-white/50 text-xs uppercase tracking-wider">
                Vraag {currentIndex + 1} / {questions.length}
              </span>
              <span className="text-white/50 text-xs">{currentQuestion.type}</span>
            </div>
            <p className="text-white font-semibold text-sm leading-snug">
              {currentQuestion.question_text}
            </p>
            <p className="text-green-400 text-xs font-bold">
              Correct: {currentQuestion.correct_answer}
            </p>
            {session.state === "question_open" && (
              <p className="text-white/60 text-sm mt-1">
                Antwoorden:{" "}
                <strong className="text-white">{answerCount}</strong> /{" "}
                {players.length}
              </p>
            )}
          </div>
        )}

        {/* Players */}
        <div
          className="rounded-xl p-4"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <p className="text-white/50 text-xs uppercase tracking-wider mb-2">
            Spelers ({players.length})
          </p>
          {players.length === 0 ? (
            <p className="text-white/30 text-sm">Nog geen spelers...</p>
          ) : (
            <div className="flex flex-col gap-1">
              {players.slice(0, 8).map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-white/80">{p.name}</span>
                  <span className="text-white/50">{p.score} pts</span>
                </div>
              ))}
              {players.length > 8 && (
                <p className="text-white/30 text-xs">
                  +{players.length - 8} meer
                </p>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        {/* Action button */}
        {session.state !== "endscreen" && (
          <button
            onClick={handleAction}
            disabled={actionLoading}
            className="w-full py-5 rounded-xl font-black text-white text-xl transition-all active:scale-95 disabled:opacity-60"
            style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}
          >
            {actionLoading ? "..." : (actionLabel[session.state] ?? "Volgende")}
          </button>
        )}

        {session.state === "endscreen" && (
          <div className="text-center py-6">
            <p className="text-white text-2xl font-black">Quiz afgerond! 🏆</p>
            <a
              href="/admin"
              className="text-white/50 text-sm mt-2 block hover:text-white/80"
            >
              Terug naar dashboard
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
