"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  doc,
  collection,
  onSnapshot,
  query,
  where,
  getDoc,
  getDocs,
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
  | "inactive"
  | "lobby"
  | "laatste_vraag"
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
  question_opened_at?: { seconds: number } | null;
  is_active?: boolean;
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
  blur_steps?: number;
  estimate_min?: number;
  estimate_max?: number;
  estimate_unit?: string;
  image_options?: string[];
  left_items?: string[];
  right_items?: string[];
  guess_duration?: 5 | 10;
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
  const [blurLevel, setBlurLevel] = useState(20);
  const [estimateValue, setEstimateValue] = useState(0);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [matchSelections, setMatchSelections] = useState<Record<number, number>>({});
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const [matchRightOrder, setMatchRightOrder] = useState<number[]>([]);

  const [playerCount, setPlayerCount] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [ranks, setRanks] = useState<PlayerRank[]>([]);
  const [countdown, setCountdown] = useState(10);
  const answersMapRef = useRef<Record<string, { answer: string; is_correct: boolean; points_awarded: number }>>({});
  const [themeLogo, setThemeLogo] = useState<string | null>(null);
  const [themeBg, setThemeBg] = useState<string | null>(null);

  // Laad thema-instellingen
  useEffect(() => {
    getDoc(doc(db, "settings", "theme")).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.logo_url) setThemeLogo(d.logo_url);
        if (d.background_url) setThemeBg(d.background_url);
      }
    });
  }, []);

  // Restore playerId from localStorage on mount.
  // localStorage survives tab close and Safari restarts; sessionStorage does not.
  // Key includes the session code so different quiz sessions don't collide.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(`quiz_player_id_${code}`);
    if (stored) setPlayerId(stored);
  }, [code]);

  // Disable iOS "Shake to Undo" — shaking the phone must not trigger anything.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevent = (e: Event) => {
      const be = e as InputEvent;
      if (be.inputType === "historyUndo" || be.inputType === "historyRedo") {
        e.preventDefault();
      }
    };
    document.addEventListener("beforeinput", prevent, true);
    return () => document.removeEventListener("beforeinput", prevent, true);
  }, []);

  // iOS keepalive: iOS Safari throttles WebSocket/long-poll connections when the
  // app has been idle. A lightweight Firestore read every 20 s keeps the connection
  // warm so real-time updates arrive instantly instead of after a 30-second delay.
  useEffect(() => {
    const iv = setInterval(() => {
      getDoc(doc(db, "sessions", code)).catch(() => {});
    }, 20_000);
    return () => clearInterval(iv);
  }, [code]);

  // Subscribe to session
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "sessions", code), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as SessionDoc;
      setSession(data);
    });
    return unsub;
  }, [code]);

  // Laad ALLE vragen eenmalig zodra quiz_id bekend is.
  // Questions change never during a live quiz, so a one-time getDocs is sufficient
  // and avoids holding an extra persistent listener (which contributes to iOS
  // WebSocket throttling when combined with the session/players/answers listeners).
  useEffect(() => {
    if (!session?.quiz_id) return;
    getDocs(collection(db, "quizzes", session.quiz_id, "questions"))
      .then((snap) => {
        const map: Record<string, QuestionDoc> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...(d.data() as Omit<QuestionDoc, "id">) };
        });
        setQuestionsMap(map);
      })
      .catch(() => {});
  }, [session?.quiz_id]);

  // Subscribe to all answers for this player (fast, parallel with session update)
  useEffect(() => {
    if (!playerId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "sessions", code, "answers"),
        where("player_id", "==", playerId)
      ),
      (snap) => {
        const map: Record<string, { answer: string; is_correct: boolean; points_awarded: number }> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          map[data.question_id] = {
            answer: data.answer,
            is_correct: data.is_correct,
            points_awarded: data.points_awarded,
          };
        });
        answersMapRef.current = map;
      }
    );
    return unsub;
  }, [code, playerId]);

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
    if (session.is_active === false) {
      setStep("inactive");
      return;
    }
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
        const qid = session.current_question_id;
        const hasAnswer = qid && answersMapRef.current[qid];
        if (hasAnswer) {
          const ans = answersMapRef.current[qid];
          setSelectedAnswer(ans.answer ?? null);
          setAnswerResult({ is_correct: ans.is_correct, points_awarded: ans.points_awarded });
          setStep("answered");
        } else {
          setSelectedAnswer(null);
          setAnswerResult(null);
          const t0 = Date.now();
          setQuestionStart(t0);
          setStep("question");
        }
        break;
      case "answer_reveal":
        setStep("reveal");
        break;
      case "leaderboard":
        setStep("leaderboard");
        break;
      case "laatste_vraag":
        setStep("laatste_vraag");
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
  }, [session?.state, session?.current_question_id, playerId]);

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
    localStorage.removeItem(`quiz_player_id_${code}`);
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

  // Blur-reveal: stapsgewijs onscherp verminderen
  useEffect(() => {
    if (question?.type !== "blur_reveal" || step !== "question") return;
    const steps = question.blur_steps ?? 5;
    const intervalMs = (question.time_limit_seconds * 1000) / steps;
    setBlurLevel(20);
    const iv = setInterval(() => {
      setBlurLevel((prev) => Math.max(0, prev - 20 / steps));
    }, intervalMs);
    return () => clearInterval(iv);
  }, [question?.id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Estimate: initieer slider op middenwaarde
  useEffect(() => {
    if (question?.type !== "estimate") return;
    const mid = Math.round(((question.estimate_min ?? 0) + (question.estimate_max ?? 100)) / 2);
    setEstimateValue(mid);
  }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Match: reset selecties en shuffle rechter items bij nieuwe vraag
  useEffect(() => {
    setMatchSelections({});
    setActiveLeft(null);
    if (question?.right_items) {
      const shuffled = [...question.right_items.keys()].sort(() => Math.random() - 0.5);
      setMatchRightOrder(shuffled);
    }
  }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guess the song: automatisch afspelen, stoppen na 5 seconden
  useEffect(() => {
    if (question?.type !== "guess_the_song" || step !== "question") return;
    setAudioPlayed(false);
    const audio = document.getElementById("guess-audio") as HTMLAudioElement | null;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    const durationMs = (question.guess_duration ?? 5) * 1000;
    const t = setTimeout(() => { audio.pause(); setAudioPlayed(true); }, durationMs);
    return () => { clearTimeout(t); audio.pause(); };
  }, [question?.id, step]); // eslint-disable-line react-hooks/exhaustive-deps

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

    localStorage.setItem(`quiz_player_id_${code}`, json.player_id);
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
      // Score updates via subscription (players collection), not here
    }
    setSubmitting(false);
  }

  // ── INACTIVE ─────────────────────────────────────────────────────────────
  if (step === "inactive") {
    return (
      <div className="speler-shell">
        <header className="speler-header">
          <img src="/logo.png" alt="Hoekies Quiz Rondje" style={{ height: "64px", objectFit: "contain" }} />
        </header>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "20px", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          <p style={{ fontSize: "clamp(2.5rem, 12vw, 4rem)" }}>🔒</p>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(1.1rem, 5vw, 1.4rem)", textAlign: "center" }}>Sessie niet actief</h2>
          <p style={{ color: "var(--muted)", fontSize: "clamp(0.85rem, 2.5vw, 1rem)", textAlign: "center" }}>Wacht op de host om de sessie te activeren.</p>
        </div>
      </div>
    );
  }

  // ── JOIN ─────────────────────────────────────────────────────────────────
  if (step === "join") {
    return (
      <div className="speler-shell">
        <header className="speler-header">
          <img src="/logo.png" alt="Hoekies Quiz Rondje" style={{ height: "64px", objectFit: "contain" }} />
          <span style={{ color: "var(--cyan)", fontWeight: 700, letterSpacing: "0.12em", fontSize: "clamp(1rem, 3vw, 1.2rem)" }}>{code}</span>
        </header>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          <div style={{ width: "100%", maxWidth: "360px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "var(--muted)", fontSize: "clamp(0.8rem, 2.5vw, 0.9rem)" }}>Voer je naam in om mee te doen</p>
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
                style={{ fontSize: "clamp(0.95rem, 4vw, 1.1rem)", fontWeight: 600, textAlign: "center" }}
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

  // ── LAATSTE VRAAG ────────────────────────────────────────────────────────
  if (step === "laatste_vraag") {
    const myRankNow = ranks.findIndex((p) => p.id === playerId) + 1;
    return (
      <div className="speler-shell" style={themeBg ? { backgroundImage: `linear-gradient(rgba(6,14,26,0.65), rgba(6,14,26,0.75)), url(${themeBg})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "20px", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          <p style={{ fontSize: "clamp(3rem, 14vw, 5rem)", lineHeight: 1 }}>🏁</p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.4rem, 6vw, 2rem)", textAlign: "center", lineHeight: 1.2 }}>Dit is de laatste vraag!</h2>
          <p style={{ color: "var(--cyan)", fontWeight: 700, fontSize: "clamp(1rem, 4vw, 1.3rem)", textAlign: "center" }}>
            Geef alles wat je hebt 💪
          </p>
          {myRankNow > 0 && (
            <div className="glass-card" style={{ padding: "14px 24px", textAlign: "center" }}>
              {myRankNow === 1 && <p style={{ color: "var(--gold)", fontWeight: 700 }}>Jij staat op #1 — verdedig je positie! 🥇</p>}
              {myRankNow === 2 && <p style={{ color: "#9ca3af", fontWeight: 700 }}>Jij staat op #2 — nog één kans om #1 te pakken! 🥈</p>}
              {myRankNow === 3 && <p style={{ color: "#b45309", fontWeight: 700 }}>Jij staat op #3 — alles of niets! 🥉</p>}
              {myRankNow > 3 && <p style={{ color: "var(--text)", fontWeight: 700 }}>Jij staat op #{myRankNow} — misschien kun je nog stijgen! ⬆️</p>}
            </div>
          )}
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Wacht op de host om te starten...</p>
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
          <span style={{ color: "var(--muted)", fontSize: "clamp(0.75rem, 2vw, 0.85rem)" }}>{playerCount} speler{playerCount !== 1 ? "s" : ""}</span>
        </header>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "20px", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          <p style={{ fontSize: "clamp(2.5rem, 12vw, 4rem)" }}>⏳</p>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(1.1rem, 5vw, 1.4rem)", textAlign: "center" }}>Wachten op de host...</h2>
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
        <header className="speler-header" style={{ justifyContent: "center", padding: "8px 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Hoekies Quiz Rondje" style={{ width: "100%", maxHeight: "72px", objectFit: "contain" }} />
        </header>
        <div className="speler-content" style={{ padding: "clamp(8px, 2vw, 12px)", gap: "clamp(6px, 1.5vw, 10px)" }}>
          <div className="glass-card" style={{ padding: "clamp(12px, 2.5vw, 16px)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "clamp(60px, 15vh, 100px)" }}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(0.95rem, 3vw, 1.1rem)", textAlign: "center", lineHeight: 1.4 }}>
              {question.question_text}
            </p>
          </div>

          {/* image */}
          {question.type === "image" && question.media_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={question.media_url} alt="Afbeelding" style={{ width: "100%", flexShrink: 0, objectFit: "contain", maxHeight: "28%", borderRadius: "12px" }} />
          )}
          {/* audio */}
          {question.type === "audio" && question.media_url && (
            <audio controls src={question.media_url} style={{ width: "100%", flexShrink: 0 }} />
          )}
          {/* blur_reveal */}
          {question.type === "blur_reveal" && question.media_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={question.media_url} alt="Afbeelding" style={{ width: "100%", flexShrink: 0, objectFit: "contain", maxHeight: "28%", borderRadius: "12px", filter: `blur(${blurLevel}px)`, transition: "filter 0.8s ease" }} />
          )}
          {/* video */}
          {question.type === "video" && question.media_url && (
            question.media_url.includes("youtube") || question.media_url.includes("youtu.be") ? (
              <iframe src={question.media_url} style={{ width: "100%", aspectRatio: "16/9", borderRadius: "12px", border: "none", flexShrink: 0 }} allow="autoplay" />
            ) : (
              <video src={question.media_url} controls style={{ width: "100%", flexShrink: 0, borderRadius: "12px", maxHeight: "28%" }} />
            )
          )}
          {/* guess_the_song */}
          {question.type === "guess_the_song" && question.media_url && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <audio id="guess-audio" src={question.media_url} preload="auto" style={{ display: "none" }} />
              <div className="glass-card" style={{ padding: "12px 20px", textAlign: "center" }}>
                {audioPlayed
                  ? <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>🎵 {question.guess_duration ?? 5} seconden gespeeld — raad het lied!</p>
                  : <p style={{ color: "var(--cyan)", fontSize: "0.85rem" }}>🎵 Luister...</p>
                }
              </div>
            </div>
          )}

          {/* Tekst antwoordknoppen */}
          {question.type !== "image_answer" && question.type !== "estimate" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", minHeight: 0 }}>
              {options.map((opt: string, i: number) => (
                <button key={i} onClick={() => handleAnswer(opt)} disabled={!!selectedAnswer}
                  className={`answer-block flex-1 ${BLOCK_CLASS[i] ?? ""}`}>
                  <span style={{ fontSize: "1.1rem", fontWeight: 900, opacity: 0.7, width: "24px" }}>{LABEL[i]}</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          )}

          {/* Afbeelding als antwoord */}
          {question.type === "image_answer" && question.image_options && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", minHeight: 0 }}>
              {question.image_options.map((url: string, i: number) => (
                <button key={i} onClick={() => handleAnswer(url)} disabled={!!selectedAnswer}
                  className={`answer-block ${BLOCK_CLASS[i] ?? ""}`}
                  style={{ padding: "4px", overflow: "hidden", flexDirection: "column", gap: "4px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Optie ${LABEL[i]}`} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }} />
                </button>
              ))}
            </div>
          )}

          {/* Schatting slider */}
          {question.type === "estimate" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "16px", padding: "0 8px" }}>
              <div style={{ textAlign: "center" }}>
                <span style={{ color: "var(--cyan)", fontWeight: 900, fontSize: "clamp(1.8rem, 8vw, 2.5rem)" }}>
                  {estimateValue}{question.estimate_unit ? ` ${question.estimate_unit}` : ""}
                </span>
              </div>
              <input type="range" min={question.estimate_min ?? 0} max={question.estimate_max ?? 100}
                value={estimateValue} onChange={(e) => setEstimateValue(Number(e.target.value))}
                disabled={!!selectedAnswer}
                style={{ width: "100%", accentColor: "var(--cyan)", height: "8px" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{question.estimate_min ?? 0}{question.estimate_unit ? ` ${question.estimate_unit}` : ""}</span>
                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{question.estimate_max ?? 100}{question.estimate_unit ? ` ${question.estimate_unit}` : ""}</span>
              </div>
              <button onClick={() => handleAnswer(String(estimateValue))} disabled={!!selectedAnswer || submitting}
                className="btn-game">
                Bevestigen
              </button>
            </div>
          )}

          {/* Match koppelen */}
          {question.type === "match" && question.left_items && question.right_items && (() => {
            const MATCH_COLORS = ["var(--cyan)", "var(--gold)", "#ff6bcd"];
            const leftItems = question.left_items!;
            const rightItems = question.right_items!;
            const allMatched = leftItems.length > 0 && Object.keys(matchSelections).length === leftItems.length;
            const orderedRight = matchRightOrder.length === rightItems.length ? matchRightOrder : [...rightItems.keys()];
            return (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", padding: "0 4px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {leftItems.map((item, i) => {
                      const color = MATCH_COLORS[i] ?? "#fff";
                      const isActive = activeLeft === i;
                      const isMatched = matchSelections[i] !== undefined;
                      return (
                        <button key={i}
                          onClick={() => !selectedAnswer && setActiveLeft(isActive ? null : i)}
                          style={{
                            padding: "12px 10px", borderRadius: "10px",
                            border: `2px solid ${isActive || isMatched ? color : "rgba(255,255,255,0.15)"}`,
                            background: isActive ? `${color}22` : isMatched ? `${color}15` : "rgba(255,255,255,0.05)",
                            color: "#fff", fontWeight: 700, fontSize: "clamp(0.85rem, 3vw, 1rem)",
                            cursor: selectedAnswer ? "default" : "pointer", textAlign: "left",
                            display: "flex", alignItems: "center", gap: "8px",
                          }}>
                          <span style={{ color, fontWeight: 900 }}>{["A","B","C"][i]}</span>
                          {item}
                          {isMatched && <span style={{ marginLeft: "auto", color, fontSize: "0.72rem" }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {orderedRight.map((ri) => {
                      const matchedByEntry = Object.entries(matchSelections).find(([, v]) => v === ri);
                      const color = matchedByEntry ? (MATCH_COLORS[Number(matchedByEntry[0])] ?? "#fff") : null;
                      return (
                        <button key={ri}
                          onClick={() => {
                            if (selectedAnswer || activeLeft === null) return;
                            setMatchSelections((prev) => ({ ...prev, [activeLeft]: ri }));
                            setActiveLeft(null);
                          }}
                          style={{
                            padding: "12px 10px", borderRadius: "10px",
                            border: `2px solid ${color ?? (activeLeft !== null ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)")}`,
                            background: color ? `${color}15` : "rgba(255,255,255,0.05)",
                            color: "#fff", fontWeight: 600, fontSize: "clamp(0.85rem, 3vw, 1rem)",
                            cursor: selectedAnswer ? "default" : activeLeft !== null ? "pointer" : "default",
                          }}>
                          {rightItems[ri]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {allMatched && !selectedAnswer && (
                  <button onClick={() => handleAnswer(JSON.stringify(matchSelections))} disabled={submitting} className="btn-game">
                    Bevestigen
                  </button>
                )}
                {!allMatched && activeLeft === null && !selectedAnswer && (
                  <p style={{ color: "var(--muted)", fontSize: "0.8rem", textAlign: "center" }}>Tik een item links aan om te koppelen</p>
                )}
                {activeLeft !== null && !selectedAnswer && (
                  <p style={{ color: MATCH_COLORS[activeLeft] ?? "var(--cyan)", fontSize: "0.8rem", textAlign: "center", fontWeight: 700 }}>
                    Kies rechts het antwoord voor {["A","B","C"][activeLeft]}
                  </p>
                )}
              </div>
            );
          })()}
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
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "16px", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          <p style={{ fontSize: "clamp(2.5rem, 12vw, 3.5rem)" }}>⏳</p>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(1.1rem, 5vw, 1.4rem)", textAlign: "center" }}>Antwoord verzonden!</h2>
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
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "20px", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          <p style={{ fontSize: "clamp(3rem, 14vw, 5rem)" }}>{correct ? "✅" : "❌"}</p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.5rem, 7vw, 2rem)", textAlign: "center" }}>{correct ? "Goed!" : "Helaas..."}</h2>
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
    const lbBgStyle = themeBg
      ? { backgroundImage: `linear-gradient(rgba(6,14,26,0.72), rgba(6,14,26,0.80)), url(${themeBg})`, backgroundSize: "cover", backgroundPosition: "center" }
      : {};
    return (
      <div className="speler-shell" style={lbBgStyle}>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "16px", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={themeLogo ?? "/logo-vierkant.png"} alt="logo" style={{ width: "clamp(112px, 28vw, 160px)", height: "clamp(112px, 28vw, 160px)", objectFit: "contain" }} />
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(1.1rem, 5vw, 1.3rem)" }}>Tussenstand</h2>
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
    const winner = ranks[0] ?? null;
    const myRank = ranks.findIndex((p) => p.id === playerId) + 1;
    const isWinner = myRank === 1;
    const medals = ["leaderboard-row--gold", "leaderboard-row--silver", "leaderboard-row--bronze"];
    const emoji = ["🥇", "🥈", "🥉"];
    const endBgStyle = themeBg
      ? { backgroundImage: `linear-gradient(rgba(6,14,26,0.72), rgba(6,14,26,0.85)), url(${themeBg})`, backgroundSize: "cover", backgroundPosition: "center" }
      : {};
    return (
      <div className="speler-shell" style={endBgStyle}>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "16px", padding: "clamp(16px, 4vh, 28px) clamp(16px, 4vw, 20px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={themeLogo ?? "/logo-vierkant.png"} alt="logo" style={{ width: "clamp(48px, 12vw, 70px)", height: "clamp(48px, 12vw, 70px)", objectFit: "contain" }} />

          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.3rem, 6vw, 1.8rem)", textAlign: "center" }}>Quiz voorbij!</h2>

          {/* Winnaar highlight */}
          {winner && (
            <div className="glass-card" style={{ width: "100%", padding: "16px 20px", textAlign: "center", borderColor: "var(--gold)", background: "rgba(255,217,59,0.08)" }}>
              <p style={{ color: "var(--gold)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Winnaar</p>
              <p style={{ fontSize: "clamp(2rem, 10vw, 3rem)", lineHeight: 1 }}>🏆</p>
              <p style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.2rem, 5vw, 1.6rem)", marginTop: "4px" }}>{winner.name}</p>
              <p style={{ color: "var(--gold)", fontWeight: 900, fontSize: "clamp(1rem, 4vw, 1.3rem)" }}>{winner.score} punten</p>
            </div>
          )}

          {/* Jij bent de winnaar */}
          {isWinner && (
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "var(--gold)", fontWeight: 900, fontSize: "clamp(1rem, 4vw, 1.3rem)" }}>Jij hebt gewonnen! 🎉</p>
            </div>
          )}

          {/* Top 3 */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
            {ranks.map((p, i) => (
              <div key={p.id} className={`leaderboard-row ${medals[i] ?? ""}`}
                style={p.id === playerId ? { outline: "2px solid var(--cyan)", outlineOffset: "2px" } : {}}>
                <span style={{ fontSize: "1.1rem", width: "24px", textAlign: "center" }}>{emoji[i]}</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{p.name}{p.id === playerId ? " (jij)" : ""}</span>
                <span style={{ fontWeight: 900, color: "var(--cyan)" }}>{p.score}</span>
              </div>
            ))}
          </div>

          {/* Jouw score als niet in top 3 */}
          {(myRank === 0 || myRank > 3) && (
            <div className="glass-card" style={{ padding: "12px 24px", textAlign: "center" }}>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>Jouw score</p>
              <p style={{ color: "#fff", fontWeight: 900, fontSize: "1.4rem" }}>{myScore} punten</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── PAUSED ───────────────────────────────────────────────────────────────
  if (step === "paused") {
    return (
      <div className="speler-shell">
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "20px", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          <p style={{ fontSize: "clamp(3rem, 14vw, 5rem)", lineHeight: 1 }}>🍺</p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.5rem, 7vw, 2rem)", textAlign: "center" }}>Pauze!</h2>
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
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "24px", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          <p style={{ fontSize: "clamp(2.5rem, 12vw, 4rem)", lineHeight: 1 }}>🍺</p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.3rem, 5vw, 1.8rem)", textAlign: "center" }}>
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
