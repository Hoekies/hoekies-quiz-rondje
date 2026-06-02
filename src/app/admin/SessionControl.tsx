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
  started_at: unknown;
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
      updateDoc(doc(db, "sessions", code), { state: back, status: "active" }).catch(console.error);
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

    const q = query(
      collection(db, "sessions", code, "answers"),
      where("question_id", "==", qid)
    );

    const unsub = onSnapshot(q, (snap) => {
      countedQidRef.current = qid;
      setAnswerCount(snap.size);
      answersValuesRef.current = snap.docs.map((d) => (d.data().answer as string) ?? "");
    });
    return unsub;
  }, [code, session?.current_question_id]);

  // Auto-sluit: zodra alle spelers geantwoord hebben → answer_reveal
  const autoClosedRef = useRef<string | null>(null);
  useEffect(() => {
    if (session?.state !== "question_open" || !session.current_question_id) return;
    // Alleen sluiten als de telling écht bij de huidige vraag hoort (anders stale count van vorige vraag)
    if (countedQidRef.current !== session.current_question_id) return;
    if (players.length === 0 || answerCount < players.length) return;
    if (autoClosedRef.current === session.current_question_id) return;
    autoClosedRef.current = session.current_question_id;
    updateDoc(doc(db, "sessions", code), { state: "answer_reveal", status: "active" }).catch(() => {});
  }, [answerCount, players.length, session?.state, session?.current_question_id, code]);

  // Auto-sluit op tijd: question_opened_at + time_limit verstreken → answer_reveal (geldt ook voor bonusvragen)
  useEffect(() => {
    if (session?.state !== "question_open" || !session.current_question_id || !session.question_opened_at?.seconds) return;
    const limit = currentQuestion?.time_limit_seconds ?? 20;
    const closeIfOverdue = () => {
      const elapsed = (Date.now() - session.question_opened_at!.seconds * 1000) / 1000;
      if (elapsed >= limit && autoClosedRef.current !== session.current_question_id) {
        autoClosedRef.current = session.current_question_id!;
        updateDoc(doc(db, "sessions", code), { state: "answer_reveal", status: "active" }).catch(() => {});
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
    }).catch(() => {});
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

  function handleAction() {
    if (!session) return;
    switch (session.state) {
      case "lobby":
      case "ronde_intro":
      case "ronde_klaar":
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
    await updateDoc(doc(db, "sessions", code), { force_end: !session.force_end });
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

  const S = { display: "flex", flexDirection: "column" as const, gap: "18px", maxWidth: "760px", margin: "0 auto", width: "100%" };

  // Gedeelde labelstijl voor paneel-koppen
  const sectionLabel = { color: "var(--muted)", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.02em" };
  // Of de secundaire beheerknoppen zichtbaar zijn
  const showBeheer = session.state !== "resuming";
  const showActieveBeheer = session.state !== "endscreen" && session.state !== "lobby" && session.state !== "resuming";

  return (
    <div style={S}>

      {/* Knoppenrij */}
      {(() => {
        const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "9px 16px", minHeight: "40px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 700, textDecoration: "none", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer" } as const;
        const msg = waTemplate.replace(/\{code\}/g, code);
        const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ ...btn, background: "rgba(13,180,171,0.12)", borderColor: "rgba(13,180,171,0.3)", color: "var(--cyan)", cursor: "default" }}>
              {session.state.replace(/_/g, " ").toUpperCase()}
            </span>
            <span style={{ flex: 1 }} />
            <a href={`/qr/${code}`} target="_blank" style={btn}>QR ↗</a>
            <a href={`/presentatie/${code}`} target="_blank" style={btn}>Presentatie ↗</a>
            <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Deel via WhatsApp" aria-label="Deel via WhatsApp"
              style={{ ...btn, padding: "9px", width: "40px", background: "linear-gradient(135deg, #25D366, #128C7E)", borderColor: "transparent", color: "#fff", boxShadow: "0 2px 10px rgba(37,211,102,0.35)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </a>
          </div>
        );
      })()}

      {/* Hoofd 2-koloms layout: links ronde-keuze / vraag, rechts spelers (stapelt op mobiel) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px", alignItems: "start" }}>

        {/* LINKS — ronde-keuze (lobby/ronde_klaar) of huidige vraag */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Ronde-klaar melding */}
          {session.state === "ronde_klaar" && (
            <div className="card" style={{ textAlign: "center", padding: "20px", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.06)" }}>
              <p style={{ fontSize: "1.6rem" }}>✅</p>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: "1rem" }}>Ronde klaar! Kies de volgende ronde of beëindig het spel.</p>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "4px" }}>Scores blijven staan en tellen op.</p>
            </div>
          )}

          {/* Ronde-keuze (lobby of tussen rondes) */}
          {(session.state === "lobby" || session.state === "ronde_klaar") && rounds.length > 0 && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px 20px" }}>
              <span style={sectionLabel}>Welke ronde?</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {rounds.map((r) => {
                  const isSelected = selectedRound === r;
                  const isPlayed = (session.played_rounds ?? []).includes(r);
                  return (
                    <button key={r} onClick={() => selectRound(r)}
                      style={{ padding: "8px 14px", minHeight: "40px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                        background: isSelected ? "var(--cyan)" : "rgba(255,255,255,0.06)",
                        color: isSelected ? "#000" : (isPlayed ? "var(--muted)" : "var(--text)"),
                        opacity: isPlayed && !isSelected ? 0.6 : 1 }}>
                      {isPlayed ? "✓ " : ""}{roundLabel(r)} ({questions.filter((q) => q.round === r).length})
                    </button>
                  );
                })}
              </div>
              <span style={{ color: "var(--cyan)", fontSize: "0.8rem" }}>{questionOrder.length} vragen geselecteerd</span>
            </div>
          )}

          {/* Huidige vraag */}
          {currentQuestion && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={sectionLabel}>
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
        </div>

        {/* RECHTS — spelers */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <p style={{ ...sectionLabel, marginBottom: "4px" }}>
            Spelers ({players.length})
          </p>
          {players.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Nog geen spelers...</p>
          ) : players.slice(0, 10).map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem" }}>
              <span style={{ color: "var(--muted)", width: "18px", fontSize: "0.75rem" }}>{i + 1}</span>
              <span style={{ color: "var(--text)", flex: 1 }}>{p.avatar ? `${p.avatar} ` : ""}{p.name}</span>
              <span style={{ color: "var(--cyan)", fontWeight: 700 }}>{p.score}</span>
            </div>
          ))}
          {players.length > 10 && <p style={{ color: "var(--muted)", fontSize: "0.75rem" }}>+{players.length - 10} meer</p>}
        </div>
      </div>

      {error && <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>{error}</p>}

      {/* Primaire actie */}
      {session.state === "endscreen" ? (
        <div className="card" style={{ textAlign: "center", padding: "20px" }}>
          <p style={{ color: "var(--ink)", fontWeight: 900, fontSize: "1.5rem" }}>Quiz afgerond! 🏆</p>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "6px" }}>De eindstand staat bij de spelers. Sluit de sessie zelf via de toggle (inactief) of verwijderen — of herstart voor een nieuwe ronde.</p>
        </div>
      ) : session.state === "resuming" ? (
        <button disabled className="btn-game" style={{ fontSize: "1.15rem", opacity: 0.7, width: "100%" }}>
          ⏱ Aftellen tot start...
        </button>
      ) : (
        <button onClick={handleAction} disabled={actionLoading} className="btn-game" style={{ fontSize: "1.15rem", width: "100%" }}>
          {actionLoading ? "..." : (actionLabel[session.state] ?? "Volgende")}
        </button>
      )}

      {/* Sessiebeheer — gegroepeerde secundaire / utility-acties */}
      {showBeheer && (() => {
        const beheerBtn = {
          display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center",
          gap: "2px", minHeight: "56px", padding: "8px 12px", borderRadius: "10px", cursor: "pointer",
          fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.2, textAlign: "center" as const, whiteSpace: "nowrap" as const,
        };
        const sub = { fontSize: "0.68rem", fontWeight: 600, opacity: 0.75 };
        return (
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>

            {/* Pauze-knop — actief tijdens antwoord/leaderboard, niet tijdens een open vraag */}
            {showActieveBeheer && (
              <button onClick={handlePause} disabled={actionLoading || !canPause}
                style={{ ...beheerBtn, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)",
                  color: "var(--text)", opacity: canPause ? 1 : 0.45,
                  cursor: canPause ? "pointer" : "not-allowed" }}>
                🍺 Pauzeer
              </button>
            )}

            {/* Stop na deze vraag — beschikbaar tijdens actieve sessie */}
            {showActieveBeheer && (
              <button onClick={handleToggleForceEnd}
                style={{ ...beheerBtn, border: `1px solid ${session.force_end ? "#ff6b35" : "rgba(255,255,255,0.2)"}`,
                  background: session.force_end ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.03)",
                  color: session.force_end ? "#ff6b35" : "var(--text)" }}>
                <span>⏸ Stop na deze vraag</span>
                {session.force_end && <span style={sub}>✓ ingeschakeld</span>}
              </button>
            )}

            {/* Herstarten */}
            <button onClick={handleRestart} disabled={actionLoading}
              style={{ ...beheerBtn, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.03)", color: "var(--text)" }}>
              <span>🔄 Herstarten</span>
              <span style={sub}>scores behouden</span>
            </button>

            {/* Resetten */}
            {session.state !== "endscreen" && (
              <button onClick={handleReset} disabled={actionLoading}
                style={{ ...beheerBtn, border: "1px solid rgba(255,59,92,0.35)", background: "rgba(255,59,92,0.06)", color: "var(--red)" }}>
                <span>🗑 Resetten</span>
                <span style={sub}>scores wissen</span>
              </button>
            )}

            {/* Beëindig spel — volle breedte, prominent */}
            {showActieveBeheer && (
              <button onClick={() => { if (window.confirm("Spel beëindigen? De eindstand verschijnt bij alle spelers. De sessie blijft open — je sluit hem zelf via de toggle of verwijderen.")) updateDoc(doc(db, "sessions", code), { state: "endscreen", status: "active", force_end: false }).catch(() => {}); }}
                disabled={actionLoading}
                style={{ ...beheerBtn, gridColumn: "1 / -1", minHeight: "48px", fontSize: "0.95rem",
                  border: "2px solid var(--red)", background: "rgba(255,59,92,0.14)", color: "var(--red)" }}>
                🏁 Beëindig spel — toon eindstand
              </button>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
