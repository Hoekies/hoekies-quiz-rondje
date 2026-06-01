"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, limit, getDocs, doc, updateDoc, writeBatch } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import Link from "next/link";
import AdminLayout from "../AdminLayout";

interface QuestionDoc {
  id: string;
  question_text: string;
  type: string;
  options: string[] | null;
  correct_answer: string;
  time_limit_seconds: number;
  base_points: number;
  is_double_points: boolean;
  round: number;
  order: number;
  media_url?: string;
  blur_steps?: number;
  estimate_min?: number;
  estimate_max?: number;
  estimate_unit?: string;
  image_options?: string[];
}

interface ImportRow {
  question_text: string;
  type: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  time_limit_seconds: string;
  base_points: string;
  is_double_points: string;
  round: string;
  order: string;
  media_url?: string;
  blur_steps?: string;
  estimate_min?: string;
  estimate_max?: string;
  estimate_unit?: string;
  image_options?: string;
}

export default function QuizBeheerPage() {
  const router = useRouter();
  const tokenRef = useRef<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeRound, setActiveRound] = useState<number | "all">("all");
  const [roundNames, setRoundNames] = useState<Record<string, string>>({});
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/admin/login");
      } else {
        tokenRef.current = await user.getIdToken();
      }
    });
    return unsub;
  }, [router]);

  // Haal eerste quiz op + ronde-namen
  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "quizzes"), limit(1)));
      if (!snap.empty) {
        setQuizId(snap.docs[0].id);
        const data = snap.docs[0].data();
        if (data.round_names) setRoundNames(data.round_names as Record<string, string>);
      }
      setLoading(false);
    })();
  }, []);

  async function saveRoundName(round: number, name: string) {
    if (!quizId) return;
    setRenaming(true);
    const updated: Record<string, string> = { ...roundNames, [String(round)]: name.trim() };
    if (!name.trim()) delete updated[String(round)];
    await updateDoc(doc(db, "quizzes", quizId), { round_names: updated });
    setRoundNames(updated);
    setRenaming(false);
  }

  // Abonneer op vragen — sorteer client-side (geen samengestelde index nodig)
  useEffect(() => {
    if (!quizId) return;
    const unsub = onSnapshot(
      collection(db, "quizzes", quizId, "questions"),
      (snap) => {
        const qs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuestionDoc, "id">) }));
        qs.sort((a, b) => (a.round - b.round) || (a.order - b.order));
        setQuestions(qs);
      },
      (err) => setActionError("Fout bij laden vragen: " + err.message)
    );
    return unsub;
  }, [quizId]);

  async function handleDeleteAll() {
    if (!quizId || questions.length === 0) return;
    if (!window.confirm(`Alle ${questions.length} vragen verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    setActionError("");
    let batch = writeBatch(db);
    let n = 0;
    for (const q of questions) {
      batch.delete(doc(db, "quizzes", quizId, "questions", q.id));
      if (++n >= 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
    }
    if (n > 0) await batch.commit();
  }

  async function handleSeed() {
    const user = auth.currentUser;
    if (!user) return;
    setImportStatus("Standaard quizzen laden...");
    const token = await user.getIdToken();
    const res = await fetch("/api/host/vragen/seed-standaard", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    setImportStatus(res.ok ? `✓ ${json.message}` : "");
    if (!res.ok) setActionError(json.error ?? "Fout bij laden");
  }

  async function handleDelete(id: string) {
    if (!quizId) return;
    if (!window.confirm("Vraag verwijderen?")) return;
    setActionError("");
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/host/vragen/${id}?quiz_id=${quizId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const json = await res.json();
      setActionError(json.error ?? "Verwijderen mislukt");
    }
  }

  function handleExport() {
    if (!questions.length) return;
    const header = "question_text,type,option_a,option_b,option_c,option_d,correct_answer,time_limit_seconds,base_points,is_double_points,round,order,media_url,blur_steps,estimate_min,estimate_max,estimate_unit,image_options";
    const rows = questions.map((q) => {
      const opts = q.options ?? [];
      const imgOpts = q.image_options ?? [];
      const cells = [
        csvCell(q.question_text),
        csvCell(q.type),
        csvCell(opts[0] ?? ""),
        csvCell(opts[1] ?? ""),
        csvCell(opts[2] ?? ""),
        csvCell(opts[3] ?? ""),
        csvCell(q.correct_answer),
        String(q.time_limit_seconds),
        String(q.base_points),
        String(q.is_double_points),
        String(q.round),
        String(q.order),
        csvCell(q.media_url ?? ""),
        String(q.blur_steps ?? ""),
        String(q.estimate_min ?? ""),
        String(q.estimate_max ?? ""),
        csvCell(q.estimate_unit ?? ""),
        csvCell(imgOpts.join("|")),
      ];
      return cells.join(",");
    });
    const csv = [header, ...rows].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hoekies-quiz-vragen.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !quizId) return;
    setImportStatus("Bezig met importeren...");
    setActionError("");

    const text = await file.text();
    const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
    if (lines.length < 2) {
      setImportStatus("");
      setActionError("CSV heeft geen datarijen");
      return;
    }

    const headers = parseCSVLine(lines[0]);
    const rows: ImportRow[] = lines.slice(1).map((line) => {
      const vals = parseCSVLine(line);
      return headers.reduce((obj, h, i) => {
        (obj as unknown as Record<string, string>)[h.trim()] = (vals[i] ?? "").trim();
        return obj;
      }, {} as ImportRow);
    });

    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();

    const res = await fetch("/api/host/vragen/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quiz_id: quizId, questions: rows }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error ?? "Import mislukt");
      setImportStatus("");
    } else {
      setImportStatus(`${json.created} vragen geïmporteerd${json.errors?.length ? ` (${json.errors.length} overgeslagen)` : ""}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--game-gradient)" }}>
        <p className="text-white/60">Laden...</p>
      </main>
    );
  }

  if (!quizId) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--game-gradient)" }}>
        <p className="text-white/60">Geen quiz gevonden. Maak eerst een quiz aan in Firestore.</p>
      </main>
    );
  }

  const rounds = [...new Set(questions.map((q) => q.round))].sort((a, b) => a - b);
  const countFor = (r: number) => questions.filter((q) => q.round === r).length;
  const roundLabel = (r: number) => roundNames[r] ? `${roundNames[r]}` : `Ronde ${r}`;
  const visible = activeRound === "all" ? questions : questions.filter((q) => q.round === activeRound);

  return (
    <AdminLayout title={`Vragen beheren (${questions.length})`}>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "800px" }}>

        {/* Acties */}
        {(() => {
          const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px 16px", borderRadius: "10px", fontSize: "0.85rem", fontWeight: 700, textDecoration: "none", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", color: "var(--text)", cursor: "pointer", textAlign: "center" as const };
          const icon = { ...btn, width: "44px", height: "44px", padding: 0, fontSize: "1.1rem", flexShrink: 0 };
          return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
              <Link href={`/admin/quiz/vraag?quiz_id=${quizId}`} style={{ ...btn, background: "var(--cyan)", borderColor: "transparent", color: "#000", flex: "1 1 auto", minWidth: "150px" }}>
                + Nieuwe vraag
              </Link>
              <button onClick={handleExport} disabled={!questions.length} title="Exporteren (CSV)" style={{ ...icon, opacity: questions.length ? 1 : 0.5 }}>
                ⬇️
              </button>
              <label style={icon} title="Importeren (CSV)">
                ⬆️
                <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImport} />
              </label>
              <button onClick={handleDeleteAll} disabled={!questions.length} title="Alle vragen verwijderen"
                style={{ ...icon, borderColor: "rgba(255,59,92,0.4)", color: "var(--red)", opacity: questions.length ? 1 : 0.5 }}>
                🗑️
              </button>
            </div>
          );
        })()}

        {importStatus && <p style={{ color: "var(--green)", fontSize: "0.85rem" }}>{importStatus}</p>}
        {actionError && <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>{actionError}</p>}

        {/* Ronde-tabs */}
        {rounds.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "10px" }}>
            <button onClick={() => setActiveRound("all")}
              style={{ padding: "6px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                background: activeRound === "all" ? "var(--cyan)" : "rgba(255,255,255,0.06)", color: activeRound === "all" ? "#000" : "var(--text)" }}>
              Alle ({questions.length})
            </button>
            {rounds.map((r) => (
              <button key={r} onClick={() => { setActiveRound(r); setRenameValue(roundNames[r] ?? ""); }}
                style={{ padding: "6px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem",
                  background: activeRound === r ? "var(--cyan)" : "rgba(255,255,255,0.06)", color: activeRound === r ? "#000" : "var(--text)" }}>
                {roundLabel(r)} ({countFor(r)})
              </button>
            ))}
          </div>
        )}

        {/* Ronde hernoemen */}
        {activeRound !== "all" && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.8rem", fontWeight: 700 }}>Naam ronde {activeRound}:</span>
            <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder={`Ronde ${activeRound}`}
              className="glass-input" style={{ width: "auto", flex: 1, minWidth: "140px", padding: "8px 12px" }} />
            <button onClick={() => saveRoundName(activeRound as number, renameValue)} disabled={renaming}
              className="btn btn-cyan" style={{ fontSize: "0.82rem", padding: "8px 14px" }}>
              {renaming ? "..." : "Opslaan"}
            </button>
          </div>
        )}

        {/* Vragenlijst */}
        {visible.length === 0 ? (
          <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: "40px" }}>
            {questions.length === 0 ? "Nog geen vragen. Voeg er een toe of importeer een CSV." : "Geen vragen in deze ronde."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {visible.map((q) => (
              <div key={q.id} className="card speler-rij" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px" }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>R{q.round} #{q.order}</span>
                    <span className="status-pil status-pil--blauw">{q.type}</span>
                    {q.is_double_points && <span className="status-pil" style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c" }}>2×</span>}
                  </div>
                  <p style={{ color: "var(--ink)", fontWeight: 600, fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.question_text}</p>
                  <p style={{ color: "var(--green)", fontSize: "0.8rem" }}>✓ {q.correct_answer}</p>
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <Link href={`/admin/quiz/vraag?quiz_id=${quizId}&id=${q.id}`} title="Bewerken"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.05)", fontSize: "1rem", textDecoration: "none" }}>✏️</Link>
                  <button onClick={() => handleDelete(q.id)} title="Verwijderen"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "38px", height: "38px", borderRadius: "8px", border: "1px solid rgba(255,59,92,0.4)", background: "rgba(255,59,92,0.06)", color: "var(--red)", fontSize: "1rem", cursor: "pointer" }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Standaard quizzen */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ color: "var(--muted)", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.02em" }}>Standaard quizzen</p>
          <p style={{ color: "var(--text)", fontSize: "0.85rem" }}>Laad 3 kant-en-klare quizzen: Sport, Algemene Kennis en Muziek (alle jaren 90/2000, 20 vragen elk).</p>
          <button onClick={handleSeed}
            style={{ alignSelf: "flex-start", fontSize: "0.88rem", fontWeight: 700, padding: "10px 18px", borderRadius: "10px", border: "1px solid rgba(0,217,255,0.35)", background: "rgba(0,217,255,0.07)", color: "var(--cyan)", cursor: "pointer" }}>
            Standaard quizzen importeren
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}

function csvCell(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
