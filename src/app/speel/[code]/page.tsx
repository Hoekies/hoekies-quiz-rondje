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
import { tick, correct, wrong, fanfare, unlock, soundEnabled, setSoundEnabled } from "@/lib/sound";

const AVATARS = ["🦊", "🐼", "🐸", "🦁", "🐙", "🦄", "🐵", "🐧", "🦖", "🐯", "🐢", "🦉"];

const LABEL = ["A", "B", "C", "D"];

function Confetti({ active, duration = 10000 }: { active: boolean; duration?: number }) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999";
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d")!;
    const colors = ["#0db4ab", "#ffd93b", "#ff6bcd", "#22c55e", "#ff3b5c", "#ffffff", "#a78bfa"];
    const particles = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 300,
      vx: (Math.random() - 0.5) * 5,
      vy: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 8 + Math.random() * 8,
      h: 4 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.15,
    }));
    const start = Date.now();
    let raf: number;
    function draw() {
      if (Date.now() - start > duration) { canvas.remove(); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.rot += p.rotV;
        if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; p.vy = 2 + Math.random() * 4; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); canvas.remove(); };
  }, [active, duration]);
  return null;
}
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
  | "finale"
  | "ronde_klaar"
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
  avatar?: string;
}

interface SessionDoc {
  quiz_id: string;
  status: string;
  state: string;
  current_question_id: string | null;
  question_index: number;
  question_order?: string[];
  reset_at?: { seconds: number } | null;
  resume_at?: { seconds: number } | null;
  question_opened_at?: { seconds: number } | null;
  is_active?: boolean;
  distribution?: Record<string, number>;
  distribution_qid?: string;
  distribution_total?: number;
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
  audio_start?: number;
  video_start?: number;
  clip_duration?: 5 | 10;
  answer_mode?: "multiple_choice" | "true_false" | "open";
  video_muted?: boolean;
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
  const [blurLevel, setBlurLevel] = useState(20);
  const [estimateValue, setEstimateValue] = useState(0);
  const [openText, setOpenText] = useState("");
  const [showSplash, setShowSplash] = useState(true);
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
  const [avatar, setAvatar] = useState(() => AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [soundOn, setSoundOn] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const tickedRef = useRef<Set<number>>(new Set());

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

  // Init geluid-voorkeur
  useEffect(() => { setSoundOn(soundEnabled()); }, []);

  // Intro-splash: 1 seconde vierkant logo + voortgangsbalk
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1000);
    return () => clearTimeout(t);
  }, []);

  // Afteltimer voor open vraag (synchroon via question_opened_at)
  useEffect(() => {
    const q = session?.current_question_id ? questionsMap[session.current_question_id] : null;
    if (session?.state !== "question_open" || !q?.time_limit_seconds || !session.question_opened_at?.seconds) {
      setTimeLeft(null);
      return;
    }
    const openedMs = session.question_opened_at.seconds * 1000;
    const limit = q.time_limit_seconds;
    const calc = () => Math.max(0, Math.ceil(limit - (Date.now() - openedMs) / 1000));
    setTimeLeft(calc());
    const iv = setInterval(() => {
      const r = calc();
      setTimeLeft(r);
      if (r > 0 && r <= 3 && !tickedRef.current.has(r) && !selectedAnswer) {
        tickedRef.current.add(r);
        tick();
      }
    }, 250);
    return () => clearInterval(iv);
  }, [session?.state, session?.current_question_id, session?.question_opened_at?.seconds, questionsMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset tick-geheugen bij nieuwe vraag
  useEffect(() => { tickedRef.current = new Set(); }, [session?.current_question_id]);

  // Geluid bij reveal
  useEffect(() => {
    if (step === "reveal" && answerResult) {
      answerResult.is_correct ? correct() : wrong();
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fanfare bij eindstand (winnaar)
  useEffect(() => {
    if (step === "endscreen") fanfare();
  }, [step]);

  // Restore playerId from localStorage on mount.
  // localStorage survives tab close and Safari restarts; sessionStorage does not.
  // Key includes the session code so different quiz sessions don't collide.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(`quiz_player_id_${code}`);
    if (stored) setPlayerId(stored);
    // Naam + avatar onthouden zodat ze ingevuld blijven (ook na reset)
    const savedName = localStorage.getItem(`quiz_name_${code}`);
    if (savedName) setName(savedName);
    const savedAvatar = localStorage.getItem(`quiz_avatar_${code}`);
    if (savedAvatar) setAvatar(savedAvatar);
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

      // Haal de open vraag meteen direct op vanuit de session-callback (zelfde
      // bewezen aanpak als de presentatiepagina). De bulk-getDocs + lazy fallback
      // hieronder blijven als extra vangnet, maar dit garandeert dat het
      // vraagscherm verschijnt zodra de host een vraag opent — ook als de bulk
      // load (nog) leeg is of een long-poll hikt.
      if (data.current_question_id && data.quiz_id) {
        const qid = data.current_question_id;
        const quizId = data.quiz_id;
        getDoc(doc(db, "quizzes", quizId, "questions", qid))
          .then((qSnap) => {
            if (qSnap.exists()) {
              setQuestionsMap((prev) =>
                prev[qid]
                  ? prev
                  : { ...prev, [qid]: { id: qSnap.id, ...(qSnap.data() as Omit<QuestionDoc, "id">) } }
              );
            }
          })
          .catch(() => {});
      }
    });
    return unsub;
  }, [code]);

  // Laad ALLE vragen eenmalig zodra quiz_id bekend is.
  // Questions change never during a live quiz, so a one-time getDocs is sufficient
  // and avoids holding an extra persistent listener (which contributes to iOS
  // WebSocket throttling when combined with the session/players/answers listeners).
  // Mislukt het ophalen (iOS long-poll hikt soms), dan opnieuw proberen i.p.v.
  // stilletjes leeg blijven (anders blijft de speler op "Vraag laden…" hangen).
  useEffect(() => {
    if (!session?.quiz_id) return;
    let cancelled = false;
    const quizId = session.quiz_id;
    const load = (attempt: number) => {
      getDocs(collection(db, "quizzes", quizId, "questions"))
        .then((snap) => {
          if (cancelled) return;
          const map: Record<string, QuestionDoc> = {};
          snap.docs.forEach((d) => {
            map[d.id] = { id: d.id, ...(d.data() as Omit<QuestionDoc, "id">) };
          });
          // Merge i.p.v. overschrijven: een eventueel lazy-geladen vraag blijft behouden
          setQuestionsMap((prev) => ({ ...prev, ...map }));
        })
        .catch(() => {
          if (cancelled || attempt >= 4) return;
          setTimeout(() => load(attempt + 1), 600 * (attempt + 1));
        });
    };
    load(0);
    return () => { cancelled = true; };
  }, [session?.quiz_id]);

  // Lazy fallback: als een vraag opengaat die (nog) niet in de map zit
  // (timing van de bulk-load, een achteraf toegevoegde vraag, of een mislukte
  // long-poll), haal die ene vraag direct op via getDoc. Dit garandeert dat het
  // vraagscherm altijd verschijnt zodra de host de vraag opent.
  const fetchingQidRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const qid = session?.current_question_id;
    const quizId = session?.quiz_id;
    if (!qid || !quizId) return;
    if (questionsMap[qid]) return; // al beschikbaar
    if (fetchingQidRef.current.has(qid)) return; // al onderweg
    fetchingQidRef.current.add(qid);
    let cancelled = false;
    // Blijf doorproberen zolang de vraag openstaat maar nog niet beschikbaar is.
    // Belangrijk: de guard (fetchingQidRef) wordt vrijgegeven zodra een poging
    // mislukt of de vraag (nog) niet bestaat, zodat een volgende render/snapshot
    // het opnieuw probeert. Anders bleef de speler na één mislukte fetch voorgoed
    // op "Vraag laden…" hangen (de regressie).
    const release = () => { fetchingQidRef.current.delete(qid); };
    const load = (attempt: number) => {
      getDoc(doc(db, "quizzes", quizId, "questions", qid))
        .then((snap) => {
          if (cancelled) return;
          if (snap.exists()) {
            setQuestionsMap((prev) =>
              prev[qid]
                ? prev
                : { ...prev, [qid]: { id: snap.id, ...(snap.data() as Omit<QuestionDoc, "id">) } }
            );
          } else if (attempt < 8) {
            setTimeout(() => load(attempt + 1), Math.min(2000, 400 * (attempt + 1)));
          } else {
            release(); // geef op voor nu, maar laat een latere render opnieuw proberen
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (attempt < 8) {
            setTimeout(() => load(attempt + 1), Math.min(2000, 400 * (attempt + 1)));
          } else {
            release();
          }
        });
    };
    load(0);
    return () => { cancelled = true; release(); };
  }, [session?.current_question_id, session?.quiz_id, questionsMap]);

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
  const wasPresentRef = useRef(false);
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
          if (me) {
            setMyScore(me.score);
            wasPresentRef.current = true;
          } else if (wasPresentRef.current) {
            // We waren ingelogd maar zijn uit de sessie verwijderd (reset/kick) → uitloggen
            wasPresentRef.current = false;
            localStorage.removeItem(`quiz_player_id_${code}`);
            setPlayerId(null);
            setStep("join");
            setSelectedAnswer(null);
            setAnswerResult(null);
            setMyScore(0);
          }
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
      case "ronde_klaar":
        setStep("ronde_klaar");
        break;
      case "finale":
        setStep("finale");
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

  // Reset selected answer + resultaat when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setAnswerResult(null);
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

  // Detecteer sessie-reset: speler terug naar het invulscherm (naam + avatar blijven bewaard)
  const lastResetRef = useRef<number | null>(null);
  useEffect(() => {
    const cur = session?.reset_at?.seconds ?? null;
    if (cur === null) return;
    // Eerste waarde onthouden zonder uit te loggen (anders logt een oude reset je meteen uit)
    if (lastResetRef.current === null) { lastResetRef.current = cur; return; }
    if (cur === lastResetRef.current) return;
    lastResetRef.current = cur;
    // Nieuwe reset → terug naar join, maar naam/avatar laten staan
    localStorage.removeItem(`quiz_player_id_${code}`);
    setPlayerId(null);
    setStep("join");
    setSelectedAnswer(null);
    setAnswerResult(null);
    setMyScore(0);
    setRanks([]);
  }, [session?.reset_at?.seconds, code]);

  // Shuffle antwoorden eenmalig als nieuwe vraag laadt
  // Huidige vraag direct uit de map — geen aparte subscription, altijd meteen beschikbaar
  const question = session?.current_question_id
    ? (questionsMap[session.current_question_id] ?? null)
    : null;



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

  // Reset open-tekst bij nieuwe vraag
  useEffect(() => { setOpenText(""); }, [question?.id]);

  // Match: reset selecties en shuffle rechter items bij nieuwe vraag
  useEffect(() => {
    setMatchSelections({});
    setActiveLeft(null);
    if (question?.right_items) {
      const shuffled = [...question.right_items.keys()].sort(() => Math.random() - 0.5);
      setMatchRightOrder(shuffled);
    }
  }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Audio: speel segment vanaf audio_start voor clip_duration seconden
  useEffect(() => {
    if (question?.type !== "audio" || step !== "question") return;
    setAudioPlayed(false);
    const audio = document.getElementById("clip-audio") as HTMLAudioElement | null;
    if (!audio) return;
    const startSec = question.audio_start ?? 0;
    const durMs = (question.clip_duration ?? question.guess_duration ?? 5) * 1000;
    const play = () => { audio.currentTime = startSec; audio.play().catch(() => {}); };
    if (audio.readyState >= 1) play(); else audio.addEventListener("loadedmetadata", play, { once: true });
    const t = setTimeout(() => { audio.pause(); setAudioPlayed(true); }, durMs);
    return () => { clearTimeout(t); audio.pause(); };
  }, [question?.id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Video MP4: speel vanaf video_start voor clip_duration seconden
  useEffect(() => {
    if (question?.type !== "video" || step !== "question") return;
    const url = question.media_url ?? "";
    const isYouTube = /youtube|youtu\.be/.test(url);
    if (isYouTube) return; // YouTube handelt iframe + timer apart
    const video = document.getElementById("clip-video") as HTMLVideoElement | null;
    if (!video) return;
    const startSec = question.video_start ?? 0;
    const durMs = (question.clip_duration ?? 5) * 1000;
    const play = () => { video.currentTime = startSec; video.play().catch(() => {}); };
    if (video.readyState >= 1) play(); else video.addEventListener("loadedmetadata", play, { once: true });
    const t = setTimeout(() => { video.pause(); }, durMs);
    return () => { clearTimeout(t); video.pause(); };
  }, [question?.id, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Join handler
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    unlock(); // audio ontgrendelen op user-gesture (iOS)
    setJoining(true);
    setJoinError("");

    const res = await fetch("/api/speler/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: name.trim(), avatar }),
    });
    const json = await res.json();

    if (!res.ok) {
      setJoinError(json.error ?? "Kan niet deelnemen");
      setJoining(false);
      return;
    }

    localStorage.setItem(`quiz_player_id_${code}`, json.player_id);
    localStorage.setItem(`quiz_name_${code}`, name.trim());
    localStorage.setItem(`quiz_avatar_${code}`, avatar);
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
    if (res.ok || json?.already_answered) {
      // Bij een dubbel antwoord (409 na reload/dubbele tik) geeft de API het
      // reeds opgeslagen resultaat terug; dat is gezaghebbend voor goed/fout +
      // punten. De speler kan de answers-collectie zelf niet lezen (rules), dus
      // dit is de enige bron voor het reveal-scherm na een reload.
      setAnswerResult({ is_correct: json.is_correct, points_awarded: json.points_awarded ?? 0 });
      if (typeof json.answer === "string" && json.answer) setSelectedAnswer(json.answer);
    }
    setSubmitting(false);
  }

  // ── INTRO SPLASH ─────────────────────────────────────────────────────────
  if (showSplash) {
    return (
      <div className="speler-shell" style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px", width: "100%", maxWidth: "300px", padding: "0 24px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={themeLogo ?? "/logo-vierkant.png"} alt="Hoekies Quiz Rondje" style={{ width: "clamp(140px, 50vw, 200px)", height: "clamp(140px, 50vw, 200px)", objectFit: "contain", animation: "pulse 1.5s ease-in-out infinite" }} />
          <div style={{ width: "100%", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: "3px", background: "var(--cyan)", width: "0%", animation: "splashbar 1s linear forwards" }} />
          </div>
        </div>
        <style>{`@keyframes splashbar { from { width: 0% } to { width: 100% } }`}</style>
      </div>
    );
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
              <p style={{ color: "var(--muted)", fontSize: "clamp(0.8rem, 2.5vw, 0.9rem)" }}>Kies een avatar en voer je naam in</p>
            </div>
            <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Avatar-kiezer */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "6px" }}>
                {AVATARS.map((a) => (
                  <button key={a} type="button" onClick={() => setAvatar(a)}
                    style={{ fontSize: "clamp(1.1rem, 5vw, 1.5rem)", padding: "6px 0", borderRadius: "10px", cursor: "pointer",
                      border: `2px solid ${avatar === a ? "var(--cyan)" : "rgba(255,255,255,0.12)"}`,
                      background: avatar === a ? "rgba(13,180,171,0.15)" : "rgba(255,255,255,0.04)" }}>
                    {a}
                  </button>
                ))}
              </div>
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
                {joining ? "Deelnemen..." : "Meedoen"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── FINALE / BONUSVRAAG ──────────────────────────────────────────────────
  if (step === "finale") {
    return (
      <div className="speler-shell" style={themeBg ? { backgroundImage: `linear-gradient(rgba(6,14,26,0.65), rgba(6,14,26,0.78)), url(${themeBg})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "center", gap: "16px", padding: "clamp(20px, 4vh, 32px) clamp(16px, 4vw, 20px)" }}>
          <p style={{ color: "var(--muted)", fontWeight: 800, fontSize: "clamp(1rem, 4vw, 1.3rem)", letterSpacing: "0.12em" }}>BONUSVRAAG</p>
          <p style={{ color: "var(--gold)", fontWeight: 900, fontSize: "clamp(4rem, 22vw, 7rem)", lineHeight: 1, textShadow: "0 0 30px rgba(255,217,59,0.5)" }}>×2</p>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(1rem, 4.5vw, 1.4rem)", textAlign: "center" }}>🔥 Dubbele punten!</p>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", textAlign: "center" }}>Maak je klaar…</p>
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
    const options = question.options ?? []; // vaste volgorde = zelfde als presentatie (kleur/letter komt overeen)
    const isOpenMode = question.type === "open" || question.answer_mode === "open";
    const timeUp = timeLeft !== null && timeLeft <= 0;
    const timePct = timeLeft !== null && question.time_limit_seconds ? (timeLeft / question.time_limit_seconds) * 100 : 100;
    return (
      <div className="speler-shell">
        <header className="speler-header" style={{ flexDirection: "column", justifyContent: "center", padding: "8px 0", gap: "4px", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Hoekies Quiz Rondje" style={{ width: "100%", maxHeight: "108px", objectFit: "contain" }} />
          <button onClick={() => { const n = !soundOn; setSoundOn(n); setSoundEnabled(n); }}
            style={{ position: "absolute", top: "6px", right: "8px", background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", opacity: 0.7 }} title="Geluid aan/uit">
            {soundOn ? "🔊" : "🔇"}
          </button>
          {session?.question_order?.length ? (
            <span style={{ color: "var(--cyan)", fontWeight: 700, fontSize: "clamp(0.8rem, 2.5vw, 0.95rem)" }}>
              Vraag {(session.question_index ?? 0) + 1} / {session.question_order.length}
            </span>
          ) : null}
        </header>
        {timeLeft !== null && (
          <div style={{ flexShrink: 0, padding: "0 clamp(8px, 2vw, 12px)" }}>
            <div style={{ width: "100%", height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
              <div style={{ width: `${timePct}%`, height: "100%", borderRadius: "4px", transition: "width 0.25s linear",
                background: timePct < 30 ? "var(--red)" : timePct < 60 ? "var(--gold)" : "var(--cyan)" }} />
            </div>
            <p style={{ textAlign: "center", color: timeUp ? "var(--red)" : "var(--muted)", fontWeight: 700, fontSize: "0.8rem", marginTop: "2px" }}>
              {timeUp ? "⏰ Tijd voorbij" : `${timeLeft}s`}
            </p>
          </div>
        )}
        <div className="speler-content" style={{ padding: "clamp(8px, 2vw, 12px)", gap: "clamp(6px, 1.5vw, 10px)" }}>
          {question.is_double_points && (
            <div style={{ flexShrink: 0, textAlign: "center", background: "linear-gradient(135deg, var(--gold), #ffb700)", color: "#1a1200", fontWeight: 900, fontSize: "clamp(0.95rem, 3.5vw, 1.2rem)", padding: "6px 14px", borderRadius: "10px", letterSpacing: "0.04em", boxShadow: "0 2px 12px rgba(255,217,59,0.4)" }}>
              ⭐ Bonusvraag! Dubbele punten
            </div>
          )}
          <div className="glass-card" style={{ padding: "clamp(12px, 2.5vw, 16px)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "clamp(60px, 15vh, 100px)" }}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(0.95rem, 3vw, 1.1rem)", textAlign: "center", lineHeight: 1.4 }}>
              {question.question_text}
            </p>
          </div>

          {/* image — vierkant */}
          {question.type === "image" && question.media_url && (
            <div style={{ flexShrink: 0, alignSelf: "center", width: "min(90vw, 38vh)", aspectRatio: "1 / 1", borderRadius: "12px", overflow: "hidden", background: "rgba(0,0,0,0.2)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={question.media_url} alt="Afbeelding" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          {/* audio: verborgen, speelt segment automatisch */}
          {question.type === "audio" && question.media_url && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              <audio id="clip-audio" src={question.media_url} preload="auto" style={{ display: "none" }} />
              <div className="glass-card" style={{ padding: "12px 20px", textAlign: "center" }}>
                {audioPlayed
                  ? <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>🎵 {question.clip_duration ?? question.guess_duration ?? 5} seconden gespeeld</p>
                  : <p style={{ color: "var(--cyan)", fontSize: "0.85rem" }}>🎵 Luister...</p>}
              </div>
            </div>
          )}
          {/* blur_reveal — vierkant */}
          {question.type === "blur_reveal" && question.media_url && (
            <div style={{ flexShrink: 0, alignSelf: "center", width: "min(90vw, 38vh)", aspectRatio: "1 / 1", borderRadius: "12px", overflow: "hidden", background: "rgba(0,0,0,0.2)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={question.media_url} alt="Afbeelding" style={{ width: "100%", height: "100%", objectFit: "cover", filter: `blur(${blurLevel}px)`, transform: "scale(1.1)", transition: "filter 0.8s ease" }} />
            </div>
          )}
          {/* video — speelt alleen op het presentatiescherm, niet op de telefoon */}
          {question.type === "video" && (
            <div className="glass-card" style={{ flexShrink: 0, alignSelf: "center", padding: "10px 18px", textAlign: "center" }}>
              <p style={{ color: "var(--cyan)", fontSize: "0.85rem" }}>📺 Kijk naar het grote scherm</p>
            </div>
          )}

          {/* Tekst antwoordknoppen */}
          {question.type !== "image_answer" && question.type !== "estimate" && !isOpenMode && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", minHeight: 0 }}>
              {options.map((opt: string, i: number) => (
                <button key={i} onClick={() => handleAnswer(opt)} disabled={!!selectedAnswer || timeUp}
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
                <button key={i} onClick={() => handleAnswer(url)} disabled={!!selectedAnswer || timeUp}
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

          {/* Open vraag — vrij typen (los type of media-antwoordtype open) */}
          {isOpenMode && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "12px", padding: "0 4px" }}>
              <input type="text" value={openText} onChange={(e) => setOpenText(e.target.value)}
                disabled={!!selectedAnswer || timeUp} placeholder="Typ je antwoord..." maxLength={80}
                className="glass-input" style={{ fontSize: "clamp(1rem, 4vw, 1.2rem)", textAlign: "center", fontWeight: 600 }}
                onKeyDown={(e) => { if (e.key === "Enter" && openText.trim() && !selectedAnswer && !timeUp) handleAnswer(openText.trim()); }} />
              <button onClick={() => handleAnswer(openText.trim())} disabled={!openText.trim() || !!selectedAnswer || submitting || timeUp}
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

  // ── RONDE KLAAR ──────────────────────────────────────────────────────────
  if (step === "ronde_klaar") {
    const medals = ["leaderboard-row--gold", "leaderboard-row--silver", "leaderboard-row--bronze"];
    const emoji = ["🥇", "🥈", "🥉"];
    const myRank = ranks.findIndex((p) => p.id === playerId) + 1;
    const bg = themeBg ? { backgroundImage: `linear-gradient(rgba(6,14,26,0.72), rgba(6,14,26,0.82)), url(${themeBg})`, backgroundSize: "cover", backgroundPosition: "center" } : {};
    return (
      <div className="speler-shell" style={bg}>
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "flex-start", gap: "14px", padding: "clamp(16px, 3vh, 24px) clamp(16px, 4vw, 20px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={themeLogo ?? "/logo-vierkant.png"} alt="logo" style={{ width: "clamp(120px, 30vw, 170px)", height: "clamp(120px, 30vw, 170px)", objectFit: "contain", flexShrink: 0, marginTop: "clamp(16px, 4vh, 32px)" }} />
          <p style={{ fontSize: "clamp(2rem, 9vw, 3rem)" }}>🏁</p>
          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.2rem, 5.5vw, 1.6rem)", textAlign: "center" }}>Ronde klaar!</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", textAlign: "center" }}>Wacht op de host voor de volgende ronde…</p>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
            {ranks.map((p, i) => (
              <div key={p.id} className={`leaderboard-row ${medals[i] ?? ""}`} style={p.id === playerId ? { outline: "2px solid var(--cyan)", outlineOffset: "2px" } : {}}>
                <span style={{ fontSize: "1.65rem", width: "32px", textAlign: "center" }}>{emoji[i]}</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{p.avatar ? `${p.avatar} ` : ""}{p.name}{p.id === playerId ? " (jij)" : ""}</span>
                <span style={{ fontWeight: 900, color: "var(--cyan)" }}>{p.score}</span>
              </div>
            ))}
          </div>
          <div className="glass-card" style={{ padding: "12px 24px", textAlign: "center", width: "100%", marginTop: "auto" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>Jouw totaal{myRank > 0 ? ` — #${myRank}` : ""}</p>
            <p style={{ color: "#fff", fontWeight: 900, fontSize: "1.4rem" }}>{myScore} punten</p>
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
          {/* Antwoordverdeling */}
          {question && session?.distribution && session.distribution_qid === session.current_question_id && (question.options?.length ?? 0) > 0 && (() => {
            const total = session.distribution_total || Object.values(session.distribution).reduce((a, b) => a + b, 0) || 1;
            return (
              <div style={{ width: "100%", maxWidth: "340px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {(question.options ?? []).map((opt, i) => {
                  const cnt = session.distribution?.[opt] ?? 0;
                  const pct = Math.round((cnt / total) * 100);
                  const isOk = opt === question.correct_answer;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "16px", fontWeight: 900, color: isOk ? "var(--green)" : "var(--muted)", fontSize: "0.8rem" }}>{LABEL[i]}</span>
                      <div style={{ flex: 1, height: "20px", borderRadius: "5px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: isOk ? "var(--green)" : "rgba(255,255,255,0.25)", transition: "width 0.5s" }} />
                      </div>
                      <span style={{ width: "34px", textAlign: "right", color: "var(--muted)", fontSize: "0.78rem" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {/* Juiste antwoord tonen (niet bij beeld-antwoorden of koppelvragen) */}
          {question && question.type !== "image_answer" && question.type !== "match" && question.correct_answer && (
            <div className="glass-card" style={{ padding: "12px 24px", textAlign: "center", borderColor: "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.10)" }}>
              <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginBottom: "2px" }}>Juiste antwoord</p>
              <p style={{ color: "var(--green)", fontWeight: 900, fontSize: "1.15rem" }}>{question.correct_answer}</p>
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
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "flex-start", gap: "14px", padding: "clamp(16px, 3vh, 24px) clamp(16px, 4vw, 20px) clamp(16px, 3vh, 24px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={themeLogo ?? "/logo-vierkant.png"} alt="logo" style={{ width: "clamp(168px, 42vw, 240px)", height: "clamp(168px, 42vw, 240px)", objectFit: "contain", flexShrink: 0, marginTop: "clamp(16px, 4vh, 32px)" }} />
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(1.1rem, 5vw, 1.3rem)" }}>Tussenstand</h2>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
            {ranks.map((p, i) => (
              <div key={p.id} className={`leaderboard-row ${medals[i] ?? ""}`}>
                <span style={{ fontSize: "1.8rem", width: "32px", textAlign: "center" }}>{emoji[i]}</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{p.avatar ? `${p.avatar} ` : ""}{p.name}</span>
                <span style={{ fontWeight: 900, color: "var(--cyan)" }}>{p.score}</span>
              </div>
            ))}
          </div>
          <div className="glass-card" style={{ padding: "14px 28px", textAlign: "center", width: "100%", marginTop: "auto" }}>
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
        <Confetti active={true} duration={10000} />
        <div className="speler-content" style={{ alignItems: "center", justifyContent: "flex-start", gap: "14px", padding: "clamp(16px, 3vh, 24px) clamp(16px, 4vw, 20px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={themeLogo ?? "/logo-vierkant.png"} alt="logo" style={{ width: "clamp(168px, 42vw, 240px)", height: "clamp(168px, 42vw, 240px)", objectFit: "contain", flexShrink: 0, marginTop: "clamp(16px, 4vh, 32px)" }} />

          <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.3rem, 6vw, 1.8rem)", textAlign: "center" }}>Quiz voorbij!</h2>

          {/* Winnaar highlight */}
          {winner && (
            <div className="glass-card" style={{ width: "100%", padding: "16px 20px", textAlign: "center", borderColor: "var(--gold)", background: "rgba(255,217,59,0.08)" }}>
              <p style={{ color: "var(--gold)", fontSize: "0.82rem", fontWeight: 700, marginBottom: "6px" }}>Winnaar</p>
              <p style={{ fontSize: "clamp(4rem, 20vw, 6rem)", lineHeight: 1 }}>🏆</p>
              <p style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(1.2rem, 5vw, 1.6rem)", marginTop: "4px" }}>{winner.avatar ? `${winner.avatar} ` : ""}{winner.name}</p>
              <p style={{ color: "var(--gold)", fontWeight: 900, fontSize: "clamp(1rem, 4vw, 1.3rem)" }}>{winner.score} punten</p>
            </div>
          )}

          {isWinner && <p style={{ color: "var(--gold)", fontWeight: 900, fontSize: "clamp(1rem, 4vw, 1.3rem)", textAlign: "center" }}>Jij hebt gewonnen! 🎉</p>}

          {/* Top 3 */}
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
            {ranks.map((p, i) => (
              <div key={p.id} className={`leaderboard-row ${medals[i] ?? ""}`}
                style={p.id === playerId ? { outline: "2px solid var(--cyan)", outlineOffset: "2px" } : {}}>
                <span style={{ fontSize: "1.65rem", width: "32px", textAlign: "center" }}>{emoji[i]}</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{p.avatar ? `${p.avatar} ` : ""}{p.name}{p.id === playerId ? " (jij)" : ""}</span>
                <span style={{ fontWeight: 900, color: "var(--cyan)" }}>{p.score}</span>
              </div>
            ))}
          </div>

          {/* Jouw score onderaan */}
          <div className="glass-card" style={{ padding: "12px 24px", textAlign: "center", width: "100%", marginTop: "auto" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>Jouw score{myRank > 0 ? ` — #${myRank}` : ""}</p>
            <p style={{ color: "#fff", fontWeight: 900, fontSize: "1.4rem" }}>{myScore} punten</p>
          </div>
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
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Er is iemand plassen, pak een drankje en wacht op de zeikers..</p>
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
                boxShadow: "0 0 12px rgba(13,180,171,0.5)",
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
