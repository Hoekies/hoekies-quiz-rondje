"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const [waTemplate, setWaTemplate] = useState("Doe mee aan Hoekies Quiz Rondje! 🎮\n\nhttps://hoekies-quiz-rondje.vercel.app/speel/{code}\n\nGebruik code: {code}");
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});

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
        const url = `https://hoekies-quiz-rondje.vercel.app/speel/${code}`;
        const dataUrl = await mod.toDataURL(url, { width: 200, margin: 2 });
        setQrDataUrl(dataUrl);
      } catch {}
    })();
  }, [code]);

  // Load WhatsApp template
  useEffect(() => {
    getDoc(doc(db, "settings", "whatsapp")).then((snap) => {
      if (snap.exists() && snap.data().template) {
        setWaTemplate(snap.data().template as string);
      } else {
        setWaTemplate("Doe mee aan Hoekies Quiz Rondje! 🎮\n\nhttps://hoekies-quiz-rondje.vercel.app/speel/{code}\n\nGebruik code: {code}");
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
    finale: "Toon bonusvraag",
    laatste_vraag: "🏁 Start laatste vraag",
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
          {waTemplate && (() => {
            const msg = waTemplate.replace(/\{code\}/g, code);
            const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
            return (
              <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Uitnodigen via WhatsApp"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "50%", background: "linear-gradient(135deg, #25D366, #128C7E)", color: "#fff", textDecoration: "none", boxShadow: "0 2px 10px rgba(37,211,102,0.4)", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </a>
            );
          })()}
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

        {/* Ronde-keuze (alleen in lobby) */}
        {session.state === "lobby" && rounds.length > 0 && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px 20px" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Welke vragen?</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button onClick={() => selectRound("all")}
                style={{ padding: "8px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                  background: selectedRound === "all" ? "var(--cyan)" : "rgba(255,255,255,0.06)", color: selectedRound === "all" ? "#000" : "var(--text)" }}>
                Hele quiz ({questions.length})
              </button>
              {rounds.map((r) => (
                <button key={r} onClick={() => selectRound(r)}
                  style={{ padding: "8px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                    background: selectedRound === r ? "var(--cyan)" : "rgba(255,255,255,0.06)", color: selectedRound === r ? "#000" : "var(--text)" }}>
                  {roundLabel(r)} ({questions.filter((q) => q.round === r).length})
                </button>
              ))}
            </div>
            <span style={{ color: "var(--cyan)", fontSize: "0.8rem" }}>{questionOrder.length} vragen geselecteerd</span>
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

        {session.state !== "resuming" && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button onClick={handleRestart} disabled={actionLoading}
              style={{ fontSize: "0.85rem", fontWeight: 700, padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "var(--text)", cursor: "pointer" }}>
              Herstarten (scores behouden)
            </button>
            {session.state !== "endscreen" && (
              <button onClick={handleReset} disabled={actionLoading}
                style={{ fontSize: "0.85rem", fontWeight: 700, padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(255,59,92,0.35)", background: "transparent", color: "var(--red)", cursor: "pointer", opacity: 0.7 }}>
                Resetten (scores wissen)
              </button>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
