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
  | "endscreen"
  | "paused"
  | "resuming";

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
  resume_at?: { seconds: number } | null;
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
  const [questionsMap, setQuestionsMap] = useState<Record<string, QuestionDoc>>({});
  const [questionStart, setQuestionStart] = useState<number>(0);

  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);

  const [playerCount, setPlayerCount] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [ranks, setRanks] = useState<PlayerRank[]>([]);
  const [countdown, setCountdown] = useState(10);

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

  // Laad ALLE vragen zodra quiz_id bekend is — geen per-vraag laadscherm meer
  useEffect(() => {
    if (!session?.quiz_id) return;
    const unsub = onSnapshot(
      collection(db, "quizzes", session.quiz_id, "questions"),
      (snap) => {
        const map: Record<string, QuestionDoc> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...(d.data() as Omit<QuestionDoc, "id">) };
        });
        setQuestionsMap(map);
      }
    );
    return unsub;
  }, [session?.quiz_id]);

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
      case "paused":
        setStep("paused");
        break;
      case "resuming":
        setStep("resuming");
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

  // 10-seconden aftelling bij resuming
  useEffect(() => {
    if (step !== "resuming" || !session?.resume_at) return;
    const endMs = session.resume_at.seconds * 1000 + 10000;
    const tick = () => {
      const rem = Math.max(0, (endMs - Date.now()) / 1000);
      setCountdown(rem);
    };
    tick();
    const iv = setInterval(tick, 100);
    return () => clearInterval(iv);
  }, [step, session?.resume_at?.seconds]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Huidige vraag direct uit de map — geen aparte subscription, altijd meteen beschikbaar
  const question = session?.current_question_id
    ? (questionsMap[session.current_question_id] ?? null)
    : null;

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
      <div className="speler-shell">
        <header className="speler-header">
          <img src="/logo.png" alt="Hoekies Quiz Rondje" style={{ height: "64px", objectFit: "contain" }} />
          <span style={{ color: "var(--cyan)", fontWeight: 700, letterSpacing: "0.12em" }}>{code}</span>
        </header>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
          <div style={{ width: "100%", maxWidth: "360px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Voer je naam in om mee te doen</p>
            </div>
            <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jouw naam"
                maxLength={24}
                autoFocus
                className="glass-input"
                style={{ fontSize: "1.1rem", fontWeight: 600, textAlign: "center" }}
              />
              {joinError && <p style={{ color: "var(--red)", fontSize: "0.85rem", textAlign: "center" }}>{joinError}</p>}
              <button type="submit" disabled={joining || !name.trim()} className="btn-game">
                {joining ? "Deelnemen..." : "Meedoen 🎮"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── LOBBY ────────────────────────────────────────────────────────────────
  if (step === "lobby") {
    return (
      <div className="speler-shell">
        <header className="speler-header">
          <img src="/logo.png" alt="Hoekies Quiz Rondje" style={{ height: "64px", objectFit: "contain" }} />
          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{playerCount} speler{playerCount !== 1 ? "s" : ""}</span>
        </header>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "20px", padding: "32px 20px" }}>
          <p style={{ fontSize: "4rem" }}>⏳</p>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "1.4rem", textAlign: "center" }}>Wachten op de host...</h2>
          {name && (
            <div className="glass-card" style={{ padding: "12px 24px", textAlign: "center" }}>
              <p style={{ color: "var(--cyan)", fontWeight: 600 }}>👤 {name} — Je bent erin! 🎉</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── QUESTION ─────────────────────────────────────────────────────────────
  if (step === "question" && question && question.id === session?.current_question_id) {
    const options = shuffledOptions.length > 0 ? shuffledOptions : (question.options ?? []);
    return (
      <div className="speler-shell">
        <div className="speler-content" style={{ padding: "12px", gap: "10px" }}>
          <div className="glass-card" style={{ padding: "16px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80px" }}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: "1.1rem", textAlign: "center", lineHeight: 1.4 }}>
              {question.question_text}
            </p>
          </div>

          {question.type === "image" && question.media_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={question.media_url} alt="Afbeelding" style={{ width: "100%", flexShrink: 0, objectFit: "contain", maxHeight: "28%", borderRadius: "12px" }} />
          )}
          {question.type === "audio" && question.media_url && (
            <audio controls src={question.media_url} style={{ width: "100%", flexShrink: 0 }} />
          )}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", minHeight: 0 }}>
            {options.map((opt: string, i: number) => (
              <button
                key={i}
                onClick={() => handleAnswer(opt)}
                disabled={!!selectedAnswer}
                className={`answer-block flex-1 ${BLOCK_CLASS[i] ?? ""}`}
              >
                <span style={{ fontSize: "1.1rem", fontWeight: 900, opacity: 0.7, width: "24px" }}>{LABEL[i]}</span>
                <span>{opt}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Vraag laadt nog
  if (step === "question") {
    return (
      <div className="speler-shell">
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--muted)", fontWeight: 600 }} className="animate-pulse">Vraag laden…</p>
        </div>
      </div>
    );
  }

  // ── ANSWERED ─────────────────────────────────────────────────────────────
  if (step === "answered") {
    return (
      <div className="speler-shell">
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "16px", padding: "32px 20px" }}>
          <p style={{ fontSize: "3.5rem" }}>⏳</p>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "1.4rem", textAlign: "center" }}>Antwoord verzonden!</h2>
          {selectedAnswer && (
            <div className="glass-card" style={{ padding: "12px 24px", textAlign: "center" }}>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Jouw keuze</p>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: "1.1rem", marginTop: "4px" }}>{selectedAnswer}</p>
            </div>
          )}
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Wachten op de host...</p>
        </div>
      </div>
    );
  }

  // ── REVEAL ───────────────────────────────────────────────────────────────
  if (step === "reveal") {
    const correct = answerResult?.is_correct;
    const pts = answerResult?.points_awarded ?? 0;
    return (
      <div className="speler-shell">
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "20px", padding: "32px 20px" }}>
          <p style={{ fontSize: "5rem" }}>{correct ? "✅" : "❌"}</p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "2rem", textAlign: "center" }}>{correct ? "Goed!" : "Helaas..."}</h2>
          {correct && pts > 0 && (
            <div className="glass-card" style={{ padding: "16px 32px", textAlign: "center", borderColor: "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.12)" }}>
              <p style={{ color: "var(--green)", fontWeight: 900, fontSize: "1.8rem" }}>+{pts} punten</p>
            </div>
          )}
          <div style={{ textAlign: "center" }}>
            {selectedAnswer && <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Jouw antwoord: <span style={{ color: "var(--ink)" }}>{selectedAnswer}</span></p>}
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "6px" }}>Totaal: <strong style={{ color: "var(--cyan)" }}>{myScore} punten</strong></p>
          </div>
        </div>
      </div>
    );
  }

  // ── LEADERBOARD ──────────────────────────────────────────────────────────
  if (step === "leaderboard") {
    const medals = ["leaderboard-row--gold", "leaderboard-row--silver", "leaderboard-row--bronze"];
    const emoji = ["🥇", "🥈", "🥉"];
    return (
      <div className="speler-shell">
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "16px", padding: "32px 20px" }}>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "1.3rem" }}>Tussenstand</h2>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
            {ranks.map((p, i) => (
              <div key={p.id} className={`leaderboard-row ${medals[i] ?? ""}`}>
                <span style={{ fontSize: "1.2rem", width: "24px", textAlign: "center" }}>{emoji[i]}</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{p.name}</span>
                <span style={{ fontWeight: 900, color: "var(--cyan)" }}>{p.score}</span>
              </div>
            ))}
          </div>
          <div className="glass-card" style={{ padding: "16px 28px", textAlign: "center" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>Jouw score</p>
            <p style={{ color: "#fff", fontWeight: 900, fontSize: "1.6rem" }}>{myScore} punten</p>
          </div>
        </div>
      </div>
    );
  }

  // ── ENDSCREEN ────────────────────────────────────────────────────────────
  if (step === "endscreen") {
    const messages = ["Top gespeeld! 🎉", "Wat een quiz! 🧠", "Tot de volgende keer! 🍻"];
    const msg = messages[myScore % messages.length];
    return (
      <div className="speler-shell">
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "20px", padding: "32px 20px" }}>
          <p style={{ fontSize: "4rem" }}>🏆</p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "2rem", textAlign: "center" }}>Quiz voorbij!</h2>
          <div className="glass-card" style={{ padding: "24px 40px", textAlign: "center", borderColor: "var(--glass-border)" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Eindstand</p>
            <p style={{ fontWeight: 900, fontSize: "3rem", color: "var(--cyan)", lineHeight: 1.1 }}>{myScore}</p>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>punten</p>
          </div>
          <p style={{ color: "var(--text)", fontSize: "1.1rem", textAlign: "center" }}>{msg}</p>
        </div>
      </div>
    );
  }

  // ── PAUSED ───────────────────────────────────────────────────────────────
  if (step === "paused") {
    return (
      <div className="speler-shell">
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "20px", padding: "32px 20px" }}>
          <p style={{ fontSize: "5rem", lineHeight: 1 }}>🍺</p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "2rem", textAlign: "center" }}>Pauze!</h2>
          <div className="glass-card" style={{ padding: "16px 28px", textAlign: "center" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Pak een drankje en wacht op de host...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── RESUMING ─────────────────────────────────────────────────────────────
  if (step === "resuming") {
    const pct = Math.min(100, (countdown / 10) * 100);
    return (
      <div className="speler-shell">
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "24px", padding: "32px 20px" }}>
          <p style={{ fontSize: "4rem", lineHeight: 1 }}>🍺</p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "1.8rem", textAlign: "center" }}>
            Quiz gaat verder!
          </h2>
          <div style={{ width: "100%", maxWidth: "320px", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
            <p style={{ color: "var(--cyan)", fontWeight: 900, fontSize: "2.5rem", lineHeight: 1 }}>
              {Math.ceil(countdown)}
            </p>
            <div style={{ width: "100%", height: "12px", background: "rgba(255,255,255,0.12)", borderRadius: "6px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${pct}%`,
                background: "linear-gradient(90deg, var(--cyan-dark), var(--cyan))",
                borderRadius: "6px",
                transition: "width 0.1s linear",
                boxShadow: "0 0 12px rgba(0,217,255,0.5)",
              }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="speler-shell">
      <div className="speler-content" style={{ alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--muted)" }}>Laden...</p>
      </div>
    </div>
  );
}
