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
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const LABEL = ["A", "B", "C", "D"];
const BLOCK_CLASS = [
  "answer-block--a",
  "answer-block--b",
  "answer-block--c",
  "answer-block--d",
];

interface SessionDoc {
  quiz_id: string;
  code: string;
  status: string;
  state: string;
  current_question_id: string | null;
  question_index: number;
  distribution?: Record<string, number>;
  distribution_qid?: string;
  distribution_total?: number;
}

interface QuestionDoc {
  id: string;
  round: number;
  order: number;
  type: string;
  question_text: string;
  media_url: string | null;
  options: string[];
  correct_answer: string;
  explanation: string | null;
  time_limit_seconds: number;
  base_points: number;
  is_double_points: boolean;
  video_start?: number;
  video_muted?: boolean;
}

interface PlayerDoc {
  id: string;
  name: string;
  score: number;
  avatar?: string;
}

export default function PresentatiePage() {
  const { code } = useParams<{ code: string }>();
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [question, setQuestion] = useState<QuestionDoc | null>(null);
  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [answerCount, setAnswerCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate QR code
  useEffect(() => {
    (async () => {
      try {
        const mod = await import("qrcode");
        const url = `${window.location.origin}/speel/${code}`;
        const dataUrl = await mod.toDataURL(url, { width: 220, margin: 2 });
        setQrDataUrl(dataUrl);
      } catch {}
    })();
  }, [code]);

  // Subscribe to session doc
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "sessions", code), async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as SessionDoc;
      setSession({ ...data, code: snap.id });

      // Load question if changed
      if (data.current_question_id && data.quiz_id) {
        const qSnap = await getDoc(
          doc(db, "quizzes", data.quiz_id, "questions", data.current_question_id)
        );
        if (qSnap.exists()) {
          setQuestion({ id: qSnap.id, ...(qSnap.data() as Omit<QuestionDoc, "id">) });
        } else {
          setQuestion(null);
        }
      } else {
        setQuestion(null);
      }
    });
    return unsub;
  }, [code]);

  // Subscribe to players (sorted by score desc)
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

    const currentQId = session.current_question_id;
    const ansQ = query(
      collection(db, "sessions", code, "answers"),
      where("question_id", "==", currentQId)
    );

    const unsub = onSnapshot(ansQ, (snap) => {
      setAnswerCount(snap.size);
    });
    return unsub;
  }, [code, session?.current_question_id]);

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (session?.state === "question_open" && question) {
      setTimeLeft(question.time_limit_seconds);
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current!);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.state, question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const timerPct = question
    ? (timeLeft / question.time_limit_seconds) * 100
    : 0;

  if (!session) {
    return (
      <div
        className="min-h-screen flex items-center justify-center scanlines"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-white/50 text-xl">Sessie laden...</p>
      </div>
    );
  }

  // ── LOBBY ────────────────────────────────────────────────────────────────
  if (session.state === "lobby") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-10 scanlines p-8"
        style={{ background: "var(--game-gradient)" }}
      >
        <h1
          className="text-white font-black text-5xl"
          style={{ textShadow: "var(--crt-glow)" }}
        >
          Hoekies Quiz Rondje
        </h1>
        <div className="flex flex-col items-center gap-4">
          <p className="text-white/60 text-lg">Sessiecode</p>
          <p
            className="font-black tracking-[0.3em] text-8xl"
            style={{
              color: "var(--cyan)",
              textShadow: "0 0 20px rgba(13,180,171,0.6)",
            }}
          >
            {code}
          </p>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR code"
              width={220}
              height={220}
              className="rounded-xl mt-2"
            />
          )}
          <p className="text-white/40 text-base mt-1">
            Scan de QR-code of ga naar{" "}
            <span className="text-white/70">
              hoekies-quiz-rondje.vercel.app/speel/{code}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 w-full max-w-sm">
          <p className="text-white/50 text-sm uppercase tracking-wider">
            Spelers ({players.length})
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {players.map((p) => (
              <span
                key={p.id}
                className="px-3 py-1.5 rounded-full text-sm font-bold text-white"
                style={{
                  background: "rgba(13,180,171,0.25)",
                  border: "1px solid rgba(13,180,171,0.4)",
                }}
              >
                {p.avatar ? `${p.avatar} ` : ""}{p.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── RONDE INTRO ──────────────────────────────────────────────────────────
  if (session.state === "ronde_intro") {
    const round = question?.round ?? 1;
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6 scanlines"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-white/50 text-2xl font-bold uppercase tracking-widest">
          Ronde
        </p>
        <p
          className="font-black text-[10rem] leading-none"
          style={{ color: "var(--cyan)", textShadow: "var(--crt-glow)" }}
        >
          {round}
        </p>
      </div>
    );
  }

  // ── QUESTION OPEN ────────────────────────────────────────────────────────
  if (session.state === "question_open" && question) {
    const options = question.options ?? [];
    return (
      <div
        className="h-screen overflow-hidden flex flex-col scanlines px-8 pt-8 pb-14 gap-5"
        style={{ background: "var(--game-gradient)" }}
      >
        {/* Timer bar */}
        <div
          className="w-full h-3 rounded-full"
          style={{ background: "rgba(255,255,255,0.10)" }}
        >
          <div
            className="timer-bar h-3 rounded-full transition-all"
            style={{ width: `${timerPct}%` }}
          />
        </div>

        {/* Timer + answer count + points */}
        <div className="flex justify-between items-center">
          <span className="text-white font-black text-3xl">{timeLeft}s</span>
          <span className="text-white/60 text-lg">
            {answerCount} antwoorden binnen
          </span>
          <span className="text-white/50 text-lg">
            {question.base_points} pts
            {question.is_double_points && " × 2"}
          </span>
        </div>

        {/* Afbeelding / vervagend beeld / koppelvraag */}
        {(question.type === "image" || question.type === "blur_reveal" || question.type === "match") && question.media_url && (() => {
          const blurPx = question.type === "blur_reveal" && question.time_limit_seconds
            ? Math.max(0, (timeLeft / question.time_limit_seconds) * 26)
            : 0;
          return (
            <div className="flex-1 min-h-0 flex justify-center items-center overflow-hidden">
              <div style={{ height: "100%", aspectRatio: "1 / 1", maxWidth: "100%", borderRadius: "16px", overflow: "hidden", background: "rgba(0,0,0,0.25)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={question.media_url}
                  alt="Afbeelding"
                  style={{ width: "100%", height: "100%", objectFit: "cover", filter: `blur(${blurPx}px)`, transform: blurPx > 0 ? "scale(1.06)" : "none", transition: "filter 0.8s ease" }}
                />
              </div>
            </div>
          );
        })()}

        {/* Video */}
        {question.type === "video" && question.media_url && (
          <div className="flex-1 min-h-0 flex justify-center items-center">
            {/youtube|youtu\.be/.test(question.media_url) ? (
              <div className="w-full max-w-3xl aspect-video rounded-xl overflow-hidden relative">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${(question.media_url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1]) ?? ""}?start=${question.video_start ?? 0}&autoplay=1&mute=${question.video_muted ? 1 : 0}&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&disablekb=1&fs=0`}
                  style={{ position: "absolute", top: "-25%", left: "-9%", width: "118%", height: "150%", border: "none", pointerEvents: "none" }}
                  allow="autoplay; encrypted-media"
                />
              </div>
            ) : (
              <video src={question.media_url} autoPlay muted={!!question.video_muted} className="max-h-full rounded-xl" />
            )}
          </div>
        )}

        {/* Audio */}
        {question.type === "audio" && question.media_url && (
          <div className="flex justify-center items-center gap-4">
            <span className="text-4xl">🎵</span>
            <audio autoPlay src={question.media_url} className="w-full max-w-md" />
          </div>
        )}

        {/* Question text */}
        <div className={`${(question.type === "image" || question.type === "blur_reveal" || question.type === "video" || (question.type === "match" && question.media_url)) ? "" : "flex-1 "}flex items-center justify-center px-4`}>
          <p
            className="text-white font-black text-4xl text-center leading-tight"
            style={{ textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
          >
            {question.question_text}
          </p>
        </div>

        {/* Answer options */}
        <div className="grid grid-cols-2 gap-4">
          {options.map((opt: string, i: number) => (
            <div key={i} className={`answer-block ${BLOCK_CLASS[i] ?? ""}`}>
              <span className="text-2xl font-black opacity-60">{LABEL[i]}</span>
              <span className="text-xl">{opt}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── ANSWER REVEAL ────────────────────────────────────────────────────────
  if (session.state === "answer_reveal" && question) {
    const options = question.options ?? [];
    return (
      <div
        className="h-screen overflow-hidden flex flex-col scanlines px-8 pt-8 pb-14 gap-5"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-white/50 text-xl text-center font-bold">Antwoord</p>

        {/* Afbeelding (scherp) bij reveal — vierkant */}
        {(question.type === "image" || question.type === "blur_reveal" || question.type === "match") && question.media_url && (
          <div className="flex-1 min-h-0 flex justify-center items-center overflow-hidden">
            <div style={{ height: "100%", aspectRatio: "1 / 1", maxWidth: "100%", borderRadius: "16px", overflow: "hidden", background: "rgba(0,0,0,0.25)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={question.media_url} alt="Afbeelding" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        )}

        <div className={`${(question.type === "image" || question.type === "blur_reveal" || (question.type === "match" && question.media_url)) ? "" : "flex-1 "}flex items-center justify-center px-4`}>
          <p className="text-white font-black text-3xl text-center leading-tight">
            {question.question_text}
          </p>
        </div>

        {/* Open / schatting: geen opties → toon het juiste antwoord groot */}
        {options.length === 0 && question.type !== "match" && question.correct_answer && (
          <div className="flex justify-center px-4">
            <div className="rounded-2xl px-10 py-6 text-center" style={{ background: "rgba(34,197,94,0.14)", border: "2px solid rgba(34,197,94,0.5)" }}>
              <p className="text-white/60 text-lg mb-1">Juiste antwoord</p>
              <p className="text-green-400 font-black text-5xl">{question.correct_answer}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {options.map((opt: string, i: number) => {
            const isCorrect = opt === question.correct_answer;
            const showDist = session.distribution && session.distribution_qid === session.current_question_id;
            const total = session.distribution_total || 1;
            const cnt = session.distribution?.[opt] ?? 0;
            const pct = showDist ? Math.round((cnt / total) * 100) : null;
            return (
              <div
                key={i}
                className={`answer-block ${BLOCK_CLASS[i] ?? ""} ${isCorrect ? "correct" : "wrong"}`}
              >
                <span className="text-2xl font-black opacity-60">{LABEL[i]}</span>
                <span className="text-xl">{opt}</span>
                {pct !== null && <span className="ml-auto text-xl font-black">{pct}%</span>}
                {isCorrect && <span className="ml-2 text-2xl">✓</span>}
              </div>
            );
          })}
        </div>

        {question.explanation && (
          <div
            className="rounded-xl p-4 text-center"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <p className="text-white/80 text-lg">{question.explanation}</p>
          </div>
        )}
      </div>
    );
  }

  // ── LEADERBOARD / RONDE KLAAR ────────────────────────────────────────────
  if (session.state === "leaderboard" || session.state === "ronde_klaar") {
    const top5 = players.slice(0, 5);
    const medals = [
      "leaderboard-row--gold",
      "leaderboard-row--silver",
      "leaderboard-row--bronze",
    ];
    const emoji = ["🥇", "🥈", "🥉", "4.", "5."];

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center scanlines p-8 gap-6"
        style={{ background: "var(--game-gradient)" }}
      >
        <h2
          className="text-white font-black text-4xl"
          style={{ textShadow: "var(--crt-glow)" }}
        >
          {session.state === "ronde_klaar" ? "Ronde klaar 🏁" : "Tussenstand 🏆"}
        </h2>
        <div className="w-full max-w-xl flex flex-col gap-3">
          {top5.map((p, i) => (
            <div key={p.id} className={`leaderboard-row ${medals[i] ?? ""}`}>
              <span className="text-2xl w-8 text-center">{emoji[i]}</span>
              <span className="font-black text-xl flex-1">{p.avatar ? `${p.avatar} ` : ""}{p.name}</span>
              <span
                className="font-black text-xl"
                style={{ color: "var(--cyan)" }}
              >
                {p.score}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── FINALE ───────────────────────────────────────────────────────────────
  if (session.state === "finale") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center scanlines gap-6"
        style={{ background: "var(--game-gradient)" }}
      >
        <p className="text-white/60 text-2xl font-bold uppercase tracking-widest">
          Finale
        </p>
        <p
          className="font-black text-8xl"
          style={{
            color: "var(--retro-yellow, #d4a017)",
            textShadow: "0 0 40px rgba(212,160,23,0.6)",
          }}
        >
          ×2
        </p>
        <p className="text-white/70 text-xl">🔥 Dubbele punten!</p>
      </div>
    );
  }

  // ── ENDSCREEN ────────────────────────────────────────────────────────────
  if (session.state === "endscreen") {
    const winner = players[0];
    const awards = [
      { label: "Snelste drukker ⚡", player: players[0] },
      {
        label: "MSN-dinosaurus 🦖",
        player: players.length > 1 ? players[players.length - 1] : undefined,
      },
      {
        label: "Grootste verrassing 🎉",
        player: players.length > 2
          ? players[Math.floor(players.length / 2)]
          : undefined,
      },
    ];

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center scanlines p-8 gap-8"
        style={{ background: "var(--game-gradient)" }}
      >
        <div className="text-center">
          <p className="text-white/50 text-xl mb-2">RetroKampioen 🏆</p>
          {winner && (
            <p
              className="text-white font-black text-6xl"
              style={{ textShadow: "var(--crt-glow)" }}
            >
              {winner.avatar ? `${winner.avatar} ` : ""}{winner.name}
            </p>
          )}
          {winner && (
            <p
              className="font-bold text-3xl mt-2"
              style={{ color: "var(--cyan)" }}
            >
              {winner.score} punten
            </p>
          )}
        </div>

        <div className="w-full max-w-md flex flex-col gap-2 mt-4">
          {awards.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <span className="text-white/70 font-semibold flex-1">{a.label}</span>
              {a.player && (
                <span className="ml-auto text-white/50 text-sm">
                  {a.player.name}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center scanlines"
      style={{ background: "var(--game-gradient)" }}
    >
      <p className="text-white/50 text-2xl capitalize">{session.state}</p>
    </div>
  );
}
