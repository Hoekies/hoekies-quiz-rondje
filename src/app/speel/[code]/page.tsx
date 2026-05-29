"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  doc,
  collection,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const LABEL = ["A", "B", "C", "D"];
const BLOCK_CLASS = [
  "answer-block--a",
  "answer-block--b",
  "answer-block--c",
  "answer-block--d",
];

type Step =
  | "join"
  | "lobby"
  | "question"
  | "answered"
  | "reveal"
  | "leaderboard"
  | "endscreen";

interface AnswerResult {
  is_correct: boolean;
  points_awarded: number;
}

interface PlayerRank {
  id: string;
  name: string;
  score: number;
}

interface SessionDoc {
  quiz_id: string;
  status: string;
  state: string;
  current_question_id: string | null;
  question_index: number;
  reset_at?: { seconds: number } | null;
}

interface QuestionDoc {
  id: string;
  round: number;
  type: string;
  question_text: string;
  media_url: string | null;
  options: string[];
  correct_answer: string;
  time_limit_seconds: number;
  base_points: number;
  is_double_points: boolean;
}

export default function SpeelPage() {
  const { code } = useParams<{ code: string }>();
  const [step, setStep] = useState<Step>("join");
  const [name, setName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [question, setQuestion] = useState<QuestionDoc | null>(null);
  const [questionStart, setQuestionStart] = useState<number>(0);

  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);

  const [playerCount, setPlayerCount] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [ranks, setRanks] = useState<PlayerRank[]>([]);

  // Restore player_id from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem("quiz_player_id");
    if (stored) {
      setPlayerId(stored);
    }
  }, []);


  // Subscribe to session
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "sessions", code), (snap) => {
      if (!snap.exists()) return;
      setSession(snap.data() as SessionDoc);
    });
    return unsub;
  }, [code]);

  // Subscribe to current question (parallel with session, no sequential round-trip)
  useEffect(() => {
    if (!session?.current_question_id || !session?.quiz_id) {
      setQuestion(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "quizzes", session.quiz_id, "questions", session.current_question_id),
      (snap) => {
        if (snap.exists()) {
          setQuestion({ id: snap.id, ...(snap.data() as Omit<QuestionDoc, "id">) });
        } else {
          setQuestion(null);
        }
      }
    );
    return unsub;
  }, [session?.current_question_id, session?.quiz_id]);

  // Subscribe to players — keeps playerCount, ranks and myScore always fresh
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "sessions", code, "players"),
      (snap) => {
        setPlayerCount(snap.size);
        const ps: PlayerRank[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PlayerRank, "id">),
        }));
        ps.sort((a, b) => b.score - a.score);
        setRanks(ps.slice(0, 3));
        if (playerId) {
          const me = ps.find((p) => p.id === playerId);
          if (me) setMyScore(me.score);
        }
      }
    );
    return unsub;
  }, [code, playerId]);

  // Determine step from session state
  useEffect(() => {
    if (!session) return;
    if (!playerId) {
      setStep("join");
      return;
    }

    switch (session.state) {
      case "lobby":
      case "ronde_intro":
        setStep("lobby");
        break;
      case "question_open":
        if (selectedAnswer) {
          setStep("answered");
        } else {
          setAnswerResult(null);
          setQuestionStart(Date.now());
          setStep("question");
        }
        break;
      case "answer_reveal":
        setStep("reveal");
        break;
      case "leaderboard":
        setStep("leaderboard");
        break;
      case "finale":
        setStep("lobby");
        break;
      case "endscreen":
        setStep("endscreen");
        break;
    }
  }, [session?.state, session?.current_question_id, selectedAnswer, playerId]);

  // Reset selected answer when question changes
  useEffect(() => {
    setSelectedAnswer(null);
  }, [session?.current_question_id]);

  // Detecteer sessie-reset: speler uitloggen zodat niemand er nog in zit
  useEffect(() => {
    if (!session?.reset_at || !playerId) return;
    sessionStorage.removeItem("quiz_player_id");
    setPlayerId(null);
    setStep("join");
    setSelectedAnswer(null);
    setAnswerResult(null);
    setMyScore(0);
    setRanks([]);
  }, [session?.reset_at?.seconds]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Shuffle antwoorden eenmalig als nieuwe vraag laadt
  useEffect(() => {
    if (!question?.options) { setShuffledOptions([]); return; }
    const opts = [...question.options];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    setShuffledOptions(opts);
  }, [question?.id]);

  // Join handler
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setJoining(true);
    setJoinError("");

    const res = await fetch("/api/speler/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: name.trim() }),
    });
    const json = await res.json();

    if (!res.ok) {
      setJoinError(json.error ?? "Kan niet deelnemen");
      setJoining(false);
      return;
    }

    sessionStorage.setItem("quiz_player_id", json.player_id);
    setPlayerId(json.player_id);
    setStep("lobby");
  }

  // Submit answer
  async function handleAnswer(answer: string) {
    if (submitting || selectedAnswer || !playerId || !question) return;
    setSubmitting(true);
    setSelectedAnswer(answer);
    setStep("answered");

    const response_time_ms = Date.now() - questionStart;

    const res = await fetch("/api/speler/antwoord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: playerId,
        session_id: code,
        question_id: question.id,
        answer,
        response_time_ms,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setAnswerResult(json as AnswerResult);
      setMyScore((s) => s + (json.points_awarded ?? 0));
    }
    setSubmitting(false);
  }

  // ── JOIN ─────────────────────────────────────────────────────────────────
  if (step === "join") {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: "var(--game-gradient)" }}
      >
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="text-center">
            <h1 className="text-white font-black text-2xl">Sessie {code}</h1>
            <p className="text-white/50 text-sm mt-1">
              Voer je naam in om mee te doen
            </p>
          </div>
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jouw naam"
              maxLength={24}
              autoFocus
              className="w-full rounded-xl px-5 py-4 text-white text-xl font-bold border-2 focus:outline-none"
              style={{
                background: "rgba(255,255,255,0.10)",
                borderColor: "rgba(255,255,255,0.20)",
              }}
            />
            {joinError && (
              <p className="text-red-400 text-sm text-center">{joinError}</p>
            )}
            <button
              type="submit"
              disabled={joining || !name.trim()}
              className="w-full py-4 rounded-xl font-black text-white text-lg active:scale-95 disabled:opacity-60 transition-all"
              style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}
            >
              {joining ? "Deelnemen..." : "Meedoen 🎮"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ── LOBBY ────────────────────────────────────────────────────────────────
  if (step === "lobby") {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center gap-6 px-4"
        style={{ background: "var(--game-gradient)" }}
      >
        <div className="text-center flex flex-col gap-3">
          <p className="text-6xl">⏳</p>
          <h2 className="text-white font-black text-2xl">
            Wachten op de host...
          </h2>
          <p className="text-white/50">
            {playerCount} speler{playerCount !== 1 ? "s" : ""} in de lobby
          </p>
        </div>
        {name && (
          <div
            className="px-6 py-3 rounded-full font-bold text-white"
            style={{
              background: "rgba(6,182,212,0.25)",
              border: "1px solid rgba(6,182,212,0.4)",
            }}
          >
            👤 {name} — Je bent erin! 🎉
          </div>
        )}
      </main>
    );
  }

  // ── QUESTION ─────────────────────────────────────────────────────────────
  if (step === "question" && question && question.id === session?.current_question_id) {
    const options = shuffledOptions.length > 0 ? shuffledOptions : (question.options ?? []);
    return (
      <main
        className="h-dvh flex flex-col p-4 gap-3 overflow-hidden"
        style={{ background: "var(--game-gradient)" }}
      >
        <div
          className="rounded-xl p-4 shrink-0 flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            minHeight: "72px",
          }}
        >
          <p className="text-white font-black text-xl text-center leading-snug">
            {question.question_text}
          </p>
        </div>

        {question.type === "image" && question.media_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={question.media_url}
            alt="Afbeelding"
            className="w-full rounded-xl shrink-0 object-contain"
            style={{ maxHeight: "30%" }}
          />
        )}

        {question.type === "audio" && question.media_url && (
          <audio controls src={question.media_url} className="w-full shrink-0" />
        )}

        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {options.map((opt: string, i: number) => (
            <button
              key={i}
              onClick={() => handleAnswer(opt)}
              disabled={!!selectedAnswer}
              className={`answer-block flex-1 ${BLOCK_CLASS[i] ?? ""}`}
            >
              <span className="text-xl font-black opacity-60 w-6">
                {LABEL[i]}
              </span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  // Vraag laadt nog (step=question maar verkeerd of geen id)
  if (step === "question") {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--game-gradient)" }}>
        <p className="text-white/60 text-lg font-bold animate-pulse">Vraag laden…</p>
      </main>
    );
  }

  // ── ANSWERED ─────────────────────────────────────────────────────────────
  if (step === "answered") {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center gap-4 px-4"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-5xl">⏳</p>
        <h2 className="text-white font-black text-2xl text-center">
          Antwoord verzonden! ⏳
        </h2>
        {selectedAnswer && (
          <p className="text-white/60 text-lg">
            Jouw keuze:{" "}
            <strong className="text-white">{selectedAnswer}</strong>
          </p>
        )}
        <p className="text-white/40 text-sm">Wachten op de host...</p>
      </main>
    );
  }

  // ── REVEAL ───────────────────────────────────────────────────────────────
  if (step === "reveal") {
    const correct = answerResult?.is_correct;
    const pts = answerResult?.points_awarded ?? 0;

    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center gap-6 px-4"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-8xl">{correct ? "✅" : "❌"}</p>
        <h2 className="text-white font-black text-3xl text-center">
          {correct ? "Goed!" : "Helaas..."}
        </h2>
        {correct && pts > 0 && (
          <div
            className="px-6 py-3 rounded-xl text-center"
            style={{
              background: "rgba(26,152,80,0.25)",
              border: "1px solid rgba(26,152,80,0.5)",
            }}
          >
            <p className="text-green-400 font-black text-2xl">+{pts} punten</p>
          </div>
        )}
        {selectedAnswer && (
          <p className="text-white/50 text-sm">
            Jouw antwoord:{" "}
            <span className="text-white/80">{selectedAnswer}</span>
          </p>
        )}
        <p className="text-white/40 text-sm mt-2">
          Totaal:{" "}
          <strong className="text-white/70">{myScore} punten</strong>
        </p>
      </main>
    );
  }

  // ── LEADERBOARD ──────────────────────────────────────────────────────────
  if (step === "leaderboard") {
    const medals = [
      "leaderboard-row--gold",
      "leaderboard-row--silver",
      "leaderboard-row--bronze",
    ];
    const emoji = ["🥇", "🥈", "🥉"];

    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center gap-6 px-4"
        style={{ background: "var(--game-gradient)" }}
      >
        <h2 className="text-white font-black text-2xl">Tussenstand</h2>
        <div className="w-full max-w-sm flex flex-col gap-3">
          {ranks.map((p, i) => (
            <div key={p.id} className={`leaderboard-row ${medals[i] ?? ""}`}>
              <span className="text-xl w-6 text-center">{emoji[i]}</span>
              <span className="font-black flex-1">{p.name}</span>
              <span className="font-black" style={{ color: "var(--cyan)" }}>
                {p.score}
              </span>
            </div>
          ))}
        </div>
        <div
          className="px-6 py-3 rounded-xl text-center"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <p className="text-white/60 text-sm">Jouw score</p>
          <p className="text-white font-black text-2xl">{myScore} punten</p>
        </div>
      </main>
    );
  }

  // ── ENDSCREEN ────────────────────────────────────────────────────────────
  if (step === "endscreen") {
    const messages = [
      "Top gespeeld! 🎉",
      "Wat een quiz! 🧠",
      "Tot de volgende keer! 🍻",
    ];
    const msg = messages[myScore % messages.length];

    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center gap-6 px-4"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-6xl">🏆</p>
        <h2 className="text-white font-black text-3xl text-center">
          Quiz voorbij!
        </h2>
        <div
          className="px-8 py-5 rounded-2xl text-center"
          style={{
            background: "rgba(6,182,212,0.15)",
            border: "1px solid rgba(6,182,212,0.35)",
          }}
        >
          <p className="text-white/60 text-sm">Eindstand</p>
          <p className="font-black text-4xl" style={{ color: "var(--cyan)" }}>
            {myScore}
          </p>
          <p className="text-white/50 text-sm">punten</p>
        </div>
        <p className="text-white/60 text-lg text-center">{msg}</p>
      </main>
    );
  }

  // Fallback
  return (
    <main
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--game-gradient)" }}
    >
      <p className="text-white/50">Laden...</p>
    </main>
  );
}
