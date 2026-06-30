"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  serverTimestamp,
  getDoc,
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
  started_at: { seconds: number } | null | undefined;
  resume_at?: { seconds: number } | null;
  resume_state?: SessionState;
  question_opened_at?: { seconds: number } | null;
  force_end?: boolean;
  distribution_qid?: string;
  played_rounds?: number[];
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
  avatar?: string;
}

export default function SessionControl({ code }: { code: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  const [players, setPlayers] = useState<PlayerDoc[]>([]);
  const [answerCount, setAnswerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [waTemplate, setWaTemplate] = useState("Doe mee aan Hoekies Quiz Rondje! 🎮\n\nhttps://hoekies-quiz-rondje.vercel.app/?code={code}\n\nGebruik code: {code}");
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.push("/admin/login");
    });
    return unsub;
  }, [router]);

  // Load WhatsApp template
  useEffect(() => {
    getDoc(doc(db, "settings", "whatsapp")).then((snap) => {
      if (snap.exists() && snap.data().template) {
        setWaTemplate(snap.data().template as string);
      } else {
        setWaTemplate("Doe mee aan Hoekies Quiz Rondje! 🎮\n\nhttps://hoekies-quiz-rondje.vercel.app/?code={code}\n\nGebruik code: {code}");
      }
    });
  }, []);

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

  // Load round names from quiz
  useEffect(() => {
    if (!session?.quiz_id) return;
    getDoc(doc(db, "quizzes", session.quiz_id)).then((snap) => {
      if (snap.exists() && snap.data().round_names) setRoundNames(snap.data().round_names as Record<string, string>);
    });
  }, [session?.quiz_id]);

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

  // Na endscreen: sessie blijft open; de admin sluit/deactiveert zelf (geen auto-redirect).

  // Na resuming: automatisch terug naar de vorige toestand na 10,5 seconden
  useEffect(() => {
    if (session?.state !== "resuming") return;
    const back = session.resume_state ?? "question_open";
    const t = setTimeout(() => {
      updateDoc(doc(db, "sessions", code), { state: back, status: "active" }).catch((e) => { console.error(e); setError("Fout bij hervatten — probeer opnieuw"); });
    }, 10500);
    return () => clearTimeout(t);
  }, [session?.state, code]);

  // Subscribe to answers for current question (count + waarden voor verdeling)
  const answersValuesRef = useRef<string[]>([]);
  const countedQidRef = useRef<string | null>(null); // welke vraag de huidige telling betreft
  useEffect(() => {
    setAnswerCount(0);
    answersValuesRef.current = [];
    countedQidRef.current = null;
    if (!session?.current_question_id) return;
    const qid = session.current_question_id;
    // Alleen antwoorden meetellen die ná het openen van deze vraag zijn ingediend,
    // zodat oude antwoorden (bv. bij het opnieuw spelen) de vraag niet meteen sluiten.
    const openedSec = session.question_opened_at?.seconds ?? 0;

    const q = query(
      collection(db, "sessions", code, "answers"),
      where("question_id", "==", qid)
    );

    const unsub = onSnapshot(q, (snap) => {
      countedQidRef.current = qid;
      const fresh = snap.docs.filter((d) => {
        const t = (d.data().submitted_at as { seconds?: number } | undefined)?.seconds ?? 0;
        return openedSec === 0 || t >= openedSec - 2; // 2s marge
      });
      setAnswerCount(fresh.length);
      answersValuesRef.current = fresh.map((d) => (d.data().answer as string) ?? "");
    });
    return unsub;
  }, [code, session?.current_question_id, session?.question_opened_at?.seconds]);

  // Auto-sluit: zodra alle spelers geantwoord hebben → answer_reveal
  const autoClosedRef = useRef<string | null>(null);
  useEffect(() => {
    if (session?.state !== "question_open" || !session.current_question_id) return;
    // Alleen sluiten als de telling écht bij de huidige vraag hoort (anders stale count van vorige vraag)
    if (countedQidRef.current !== session.current_question_id) return;
    if (players.length === 0 || answerCount < players.length) return;
    if (autoClosedRef.current === session.current_question_id) return;
    autoClosedRef.current = session.current_question_id;
    updateDoc(doc(db, "sessions", code), { state: "answer_reveal", status: "active" }).catch(console.error);
  }, [answerCount, players.length, session?.state, session?.current_question_id, code]);

  // Auto-sluit op tijd: question_opened_at + time_limit verstreken → answer_reveal (geldt ook voor bonusvragen)
  useEffect(() => {
    if (session?.state !== "question_open" || !session.current_question_id || !session.question_opened_at?.seconds) return;
    const limit = currentQuestion?.time_limit_seconds ?? 20;
    const closeIfOverdue = () => {
      const elapsed = (Date.now() - session.question_opened_at!.seconds * 1000) / 1000;
      if (elapsed >= limit && autoClosedRef.current !== session.current_question_id) {
        autoClosedRef.current = session.current_question_id!;
        updateDoc(doc(db, "sessions", code), { state: "answer_reveal", status: "active" }).catch(console.error);
      }
    };
    const iv = setInterval(closeIfOverdue, 500);
    // Ook sluiten zodra het tabblad weer zichtbaar wordt (interval wordt op de achtergrond afgeknepen)
    const onVis = () => { if (!document.hidden) closeIfOverdue(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [session?.state, session?.current_question_id, session?.question_opened_at?.seconds, code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Schrijf antwoordverdeling bij answer_reveal
  useEffect(() => {
    if (session?.state !== "answer_reveal" || !session.current_question_id) return;
    if (session.distribution_qid === session.current_question_id) return;
    const counts: Record<string, number> = {};
    answersValuesRef.current.forEach((a) => { if (a) counts[a] = (counts[a] ?? 0) + 1; });
    updateDoc(doc(db, "sessions", code), {
      distribution: counts,
      distribution_qid: session.current_question_id,
      distribution_total: answersValuesRef.current.length,
    }).catch(console.error);
  }, [session?.state, session?.current_question_id, session?.distribution_qid, code]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Ronde-keuze (alleen in lobby)
  const rounds = [...new Set(questions.map((q) => q.round))].sort((a, b) => a - b);
  const roundLabel = (r: number) => roundNames[r] ? roundNames[r] : `Ronde ${r}`;
  // Welke ronde is momenteel geselecteerd? (alle order-ids horen bij die ronde)
  const selectedRound: number | "all" = (() => {
    if (!session?.question_order?.length) return "all";
    const rs = new Set(session.question_order.map((id) => questions.find((q) => q.id === id)?.round).filter((r) => r !== undefined));
    return rs.size === 1 ? ([...rs][0] as number) : "all";
  })();

  async function selectRound(r: number | "all") {
    const ids = (r === "all" ? questions : questions.filter((q) => q.round === r)).map((q) => q.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    await updateDoc(doc(db, "sessions", code), { question_order: ids, current_question_id: null, question_index: 0 });
  }

  async function handleReset() {
    if (!window.confirm("Sessie volledig resetten? Alle scores worden op 0 gezet en antwoorden gewist.")) return;
    setActionLoading(true); setError("");
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

  async function handleRestart() {
    if (!window.confirm("Sessie herstarten? Spelers en scores blijven behouden, de quiz begint opnieuw van voren af aan.")) return;
    setActionLoading(true); setError("");
    const user = auth.currentUser;
    if (!user) { router.push("/admin/login"); return; }
    const token = await user.getIdToken();
    const res = await fetch(`/api/host/sessie/${code}/restart`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Fout bij herstarten");
    setActionLoading(false);
  }

  // Start een ronde: wis eerst eventuele oude antwoorden van deze vragen (zodat
  // spelers opnieuw kunnen kiezen en de score niet dubbel telt), dan vraag openen.
  async function startRound() {
    const order = [...questionOrder];
    try {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        await fetch(`/api/host/sessie/${code}/clear-round`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ question_ids: order }),
        });
      }
    } catch { /* niet blokkeren */ }
    patchSession("question_open", {
      current_question_id: order[0] ?? null,
      question_index: 0,
      question_opened_at: serverTimestamp(),
    });
  }

  function handleAction() {
    if (!session) return;
    switch (session.state) {
      case "lobby":
      case "ronde_intro":
      case "ronde_klaar":
        startRound();
        break;
      case "question_open":
        patchSession("answer_reveal");
        break;
      case "answer_reveal":
        patchSession("leaderboard");
        break;
      case "leaderboard": {
        // "Stop na deze vraag" (force_end) of laatste vraag van de ronde → einde ronde + tussenstand
        if (session?.force_end || isLastQuestion) {
          const justPlayedRound = currentQuestion?.round ?? (typeof selectedRound === "number" ? selectedRound : undefined);
          const played = new Set(session?.played_rounds ?? []);
          if (justPlayedRound !== undefined) played.add(justPlayedRound);
          patchSession("ronde_klaar", { current_question_id: null, force_end: false, played_rounds: [...played].sort((a, b) => a - b) });
        } else if (nextQuestion?.is_double_points) {
          patchSession("finale", {
            current_question_id: nextQuestion.id,
            question_index: currentIdx + 1,
          });
        } else if (currentIdx + 1 === questionOrder.length - 1 && !session?.force_end) {
          // Volgende vraag is de laatste → motivatiescherm eerst
          patchSession("laatste_vraag", {
            current_question_id: nextQuestionId ?? null,
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
      }
      case "laatste_vraag":
        patchSession("question_open", {
          current_question_id: session.current_question_id,
          question_opened_at: serverTimestamp(),
        });
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

  const canPause = !!session && ["answer_reveal", "leaderboard", "ronde_klaar"].includes(session.state);
  function handlePause() {
    if (canPause) patchSession("paused", { resume_state: session!.state });
  }

  async function handleToggleForceEnd() {
    if (!session) return;
    try {
      await updateDoc(doc(db, "sessions", code), { force_end: !session.force_end });
    } catch (err) {
      console.error(err);
      setError("Fout bij updaten — controleer of je ingelogd bent als admin");
    }
  }

  const nextLabel = session?.force_end
    ? "✅ Ronde afronden"
    : isLastQuestion
    ? "✅ Ronde afronden"
    : nextQuestion?.is_double_points
    ? "🔥 Bonusvraag"
    : "➡ Volgende vraag";

  const actionLabel: Record<string, string> = {
    lobby: "🚀 Start quiz",
    ronde_intro: "🚀 Start quiz",
    question_open: "🔒 Sluit antwoorden",
    answer_reveal: "📊 Leaderboard",
    leaderboard: nextLabel,
    finale: "Toon bonusvraag",
    laatste_vraag: "🏁 Start laatste vraag",
    ronde_klaar: "🚀 Start volgende ronde",
    paused: "▶ Hervat quiz",
    resuming: "⏱ Aftellen...",
    endscreen: "Quiz afgerond",
  };

  if (loading) return null;
  if (!session) return <p style={{ color: "var(--muted)" }}>Sessie niet gevonden.</p>;

  const showBeheer = session.state !== "resuming";
  const showActieveBeheer = session.state !== "endscreen" && session.state !== "lobby" && session.state !== "resuming";

  const stateInfo: Record<string, { text: string; color: string; dot: string }> = {
    lobby:         { text: "Lobby",          color: "rgba(13,180,171,0.18)",  dot: "var(--cyan)"  },
    ronde_intro:   { text: "Intro",          color: "rgba(13,180,171,0.18)",  dot: "var(--cyan)"  },
    question_open: { text: "Vraag open",     color: "rgba(34,197,94,0.18)",   dot: "var(--green)" },
    answer_reveal: { text: "Antwoorden",     color: "rgba(96,165,250,0.18)",  dot: "#60a5fa"      },
    leaderboard:   { text: "Tussenstand",    color: "rgba(255,217,59,0.18)",  dot: "var(--gold)"  },
    ronde_klaar:   { text: "Ronde klaar",    color: "rgba(34,197,94,0.18)",   dot: "var(--green)" },
    finale:        { text: "Bonusvraag ×2",  color: "rgba(255,217,59,0.18)",  dot: "var(--gold)"  },
    laatste_vraag: { text: "Laatste vraag",  color: "rgba(249,115,22,0.18)",  dot: "#f97316"      },
    paused:        { text: "Pauze",          color: "rgba(249,115,22,0.18)",  dot: "#f97316"      },
    resuming:      { text: "Hervatten…",     color: "rgba(13,180,171,0.18)",  dot: "var(--cyan)"  },
    endscreen:     { text: "Quiz afgerond",  color: "rgba(255,217,59,0.18)",  dot: "var(--gold)"  },
  };
  const si = stateInfo[session.state] ?? { text: session.state, color: "rgba(255,255,255,0.1)", dot: "var(--muted)" };

  const lnk: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px 16px", height: "38px", borderRadius: "10px", fontSize: "0.82rem", fontWeight: 700, textDecoration: "none", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "var(--text)", cursor: "pointer", whiteSpace: "nowrap" };

  const msg = waTemplate.replace(/\{code\}/g, code);
  const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;

  const secLabel: React.CSSProperties = { color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "760px", margin: "0 auto", width: "100%" }}>

      {/* Status + navigatieknoppen */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "5px 14px", borderRadius: "99px", background: si.color, fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.04em", color: "#fff" }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: si.dot, flexShrink: 0 }} />
          {si.text.toUpperCase()}
        </div>
        <div style={{ flex: 1 }} />
        <a href={`/qr/${code}`} target="_blank" style={lnk}>QR ↗</a>
        <a href={`/presentatie/${code}`} target="_blank" style={lnk}>Presentatie ↗</a>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Deel via WhatsApp" aria-label="Deel via WhatsApp"
          style={{ ...lnk, padding: "0", width: "38px", background: "linear-gradient(135deg,#25D366,#128C7E)", borderColor: "transparent", color: "#fff" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </a>
      </div>

      {/* 2-koloms: vraag + spelers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", alignItems: "start" }}>

        {/* LINKS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Ronde klaar */}
          {session.state === "ronde_klaar" && (
            <div className="card" style={{ textAlign: "center", padding: "24px 20px", border: "1px solid rgba(34,197,94,0.25)", background: "rgba(34,197,94,0.05)" }}>
              <p style={{ fontSize: "2rem", marginBottom: "8px" }}>✅</p>
              <p style={{ color: "#fff", fontWeight: 700 }}>Ronde klaar!</p>
              <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: "4px" }}>Kies de volgende ronde of beëindig het spel.</p>
            </div>
          )}

          {/* Ronde-keuze */}
          {(session.state === "lobby" || session.state === "ronde_klaar") && rounds.length > 0 && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "20px" }}>
              <span style={secLabel}>Kies ronde</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {rounds.map((r) => {
                  const isSel = selectedRound === r;
                  const isPlayed = (session.played_rounds ?? []).includes(r);
                  return (
                    <button key={r} onClick={() => selectRound(r)}
                      style={{ padding: "7px 14px", borderRadius: "8px", border: `1px solid ${isSel ? "var(--cyan)" : "rgba(255,255,255,0.12)"}`, cursor: "pointer", fontWeight: 700, fontSize: "0.83rem",
                        background: isSel ? "var(--cyan)" : "rgba(255,255,255,0.05)",
                        color: isSel ? "#000" : (isPlayed ? "var(--muted)" : "var(--text)"),
                        opacity: isPlayed && !isSel ? 0.55 : 1 }}>
                      {isPlayed ? "✓ " : ""}{roundLabel(r)} <span style={{ opacity: 0.6, fontWeight: 500 }}>({questions.filter((q) => q.round === r).length})</span>
                    </button>
                  );
                })}
              </div>
              <p style={{ color: "var(--cyan)", fontSize: "0.8rem" }}>{questionOrder.length} vragen geselecteerd</p>
            </div>
          )}

          {/* Huidige vraag */}
          {currentQuestion && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={secLabel}>Vraag {currentIdx + 1} / {questionOrder.length}</span>
                <span className="status-pil status-pil--blauw">{currentQuestion.type}</span>
              </div>
              <p style={{ color: "#fff", fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.45 }}>{currentQuestion.question_text}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "8px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}>
                <span style={{ color: "var(--green)", fontWeight: 900, fontSize: "0.9rem" }}>✓</span>
                <span style={{ color: "var(--green)", fontWeight: 600, fontSize: "0.88rem" }}>{currentQuestion.correct_answer}</span>
              </div>

              {/* Antwoord-voortgang */}
              {session.state === "question_open" && players.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ ...secLabel }}>Antwoorden binnen</span>
                    <span style={{ color: "#fff", fontWeight: 900, fontSize: "1rem" }}>{answerCount}<span style={{ color: "var(--muted)", fontWeight: 500, fontSize: "0.78rem" }}> / {players.length}</span></span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "3px", background: "var(--cyan)", width: `${players.length > 0 ? Math.round((answerCount / players.length) * 100) : 0}%`, transition: "width 0.3s ease" }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RECHTS — spelers */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "20px" }}>
          <p style={{ ...secLabel, marginBottom: "6px" }}>Spelers <span style={{ color: "#fff" }}>({players.length})</span></p>
          {players.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Nog geen spelers…</p>
          ) : players.slice(0, 10).map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "5px 0", borderBottom: i < Math.min(players.length, 10) - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <span style={{ color: "var(--muted)", width: "18px", fontSize: "0.72rem", textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
              <span style={{ color: "var(--text)", flex: 1, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.avatar ? `${p.avatar} ` : ""}{p.name}</span>
              <span style={{ color: "var(--cyan)", fontWeight: 700, fontSize: "0.88rem", flexShrink: 0 }}>{p.score}</span>
            </div>
          ))}
          {players.length > 10 && <p style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: "4px" }}>+{players.length - 10} meer</p>}
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--red)", background: "rgba(255,59,92,0.08)", border: "1px solid rgba(255,59,92,0.25)", borderRadius: "10px", padding: "10px 16px", fontSize: "0.85rem" }}>
          ⚠ {error}
        </div>
      )}

      {/* Primaire actie */}
      {session.state === "endscreen" ? (
        <div className="card" style={{ textAlign: "center", padding: "24px 20px", border: "1px solid rgba(255,217,59,0.2)", background: "rgba(255,217,59,0.05)" }}>
          <p style={{ fontSize: "2rem", marginBottom: "8px" }}>🏆</p>
          <p style={{ color: "#fff", fontWeight: 900, fontSize: "1.3rem" }}>Quiz afgerond!</p>
          <p style={{ color: "var(--muted)", fontSize: "0.83rem", marginTop: "6px" }}>Sluit de sessie via de toggle of verwijderen — of herstart voor een nieuwe ronde.</p>
        </div>
      ) : session.state === "resuming" ? (
        <button disabled className="btn-game" style={{ fontSize: "1.1rem", opacity: 0.6 }}>⏱ Aftellen tot start…</button>
      ) : (
        <button onClick={handleAction} disabled={actionLoading} className="btn-game" style={{ fontSize: "1.1rem" }}>
          {actionLoading ? "…" : (actionLabel[session.state] ?? "Volgende")}
        </button>
      )}

      {/* Sessiebeheer */}
      {showBeheer && (
        <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={secLabel}>Sessiebeheer</span>

          {/* Actie-knoppen rij */}
          {(showActieveBeheer || true) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {showActieveBeheer && (
                <button onClick={handlePause} disabled={actionLoading || !canPause}
                  style={{ flex: "1 1 auto", minWidth: "120px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", padding: "12px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: canPause ? "var(--text)" : "var(--muted)", cursor: canPause ? "pointer" : "not-allowed", opacity: canPause ? 1 : 0.45, fontFamily: "var(--font)" }}>
                  <span style={{ fontSize: "1.1rem" }}>🍺</span>
                  <span style={{ fontWeight: 700, fontSize: "0.82rem" }}>Pauzeer</span>
                </button>
              )}
              {showActieveBeheer && (
                <button onClick={handleToggleForceEnd}
                  style={{ flex: "1 1 auto", minWidth: "120px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", padding: "12px 16px", borderRadius: "10px", border: `1px solid ${session.force_end ? "rgba(249,115,22,0.5)" : "rgba(255,255,255,0.14)"}`, background: session.force_end ? "rgba(249,115,22,0.1)" : "rgba(255,255,255,0.05)", color: session.force_end ? "#f97316" : "var(--text)", cursor: "pointer", fontFamily: "var(--font)" }}>
                  <span style={{ fontSize: "1.1rem" }}>⏸</span>
                  <span style={{ fontWeight: 700, fontSize: "0.82rem" }}>Stop na vraag</span>
                  {session.force_end && <span style={{ fontSize: "0.68rem", opacity: 0.8 }}>✓ aan</span>}
                </button>
              )}
              <button onClick={handleRestart} disabled={actionLoading}
                style={{ flex: "1 1 auto", minWidth: "120px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", padding: "12px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer", fontFamily: "var(--font)" }}>
                <span style={{ fontSize: "1.1rem" }}>🔄</span>
                <span style={{ fontWeight: 700, fontSize: "0.82rem" }}>Herstarten</span>
                <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>scores behouden</span>
              </button>
              {session.state !== "endscreen" && (
                <button onClick={handleReset} disabled={actionLoading}
                  style={{ flex: "1 1 auto", minWidth: "120px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", padding: "12px 16px", borderRadius: "10px", border: "1px solid rgba(255,59,92,0.3)", background: "rgba(255,59,92,0.06)", color: "var(--red)", cursor: "pointer", fontFamily: "var(--font)" }}>
                  <span style={{ fontSize: "1.1rem" }}>🗑</span>
                  <span style={{ fontWeight: 700, fontSize: "0.82rem" }}>Resetten</span>
                  <span style={{ fontSize: "0.68rem", opacity: 0.75 }}>scores wissen</span>
                </button>
              )}
            </div>
          )}

          {/* Beëindig spel — apart, minder schreeuwerig */}
          {showActieveBeheer && (
            <button
              onClick={() => { if (window.confirm("Spel beëindigen? De eindstand verschijnt bij alle spelers. De sessie blijft open — je sluit hem zelf via de toggle of verwijderen.")) updateDoc(doc(db, "sessions", code), { state: "endscreen", status: "active", force_end: false }).catch((e) => { console.error(e); setError("Fout bij beëindigen — probeer opnieuw"); }); }}
              disabled={actionLoading}
              style={{ width: "100%", padding: "13px 20px", borderRadius: "10px", border: "1px solid rgba(255,59,92,0.4)", background: "rgba(255,59,92,0.08)", color: "var(--red)", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", fontFamily: "var(--font)" }}>
              🏁 Beëindig spel — toon eindstand
            </button>
          )}
        </div>
      )}
    </div>
  );
}
