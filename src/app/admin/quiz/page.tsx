"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, orderBy, limit, getDocs } from "firebase/firestore";
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

  // Haal eerste quiz op
  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, "quizzes"), limit(1)));
      if (!snap.empty) setQuizId(snap.docs[0].id);
      setLoading(false);
    })();
  }, []);

  // Abonneer op vragen
  useEffect(() => {
    if (!quizId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "quizzes", quizId, "questions"),
        orderBy("round"),
        orderBy("order")
      ),
      (snap) => {
        setQuestions(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuestionDoc, "id">) }))
        );
      }
    );
    return unsub;
  }, [quizId]);

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
    const header = "question_text,type,option_a,option_b,option_c,option_d,correct_answer,time_limit_seconds,base_points,is_double_points,round,order";
    const rows = questions.map((q) => {
      const opts = q.options ?? [];
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

  return (
    <AdminLayout title={`Vragen beheren (${questions.length})`}>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "800px" }}>

        {/* Acties */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <Link href={`/admin/quiz/vraag?quiz_id=${quizId}`} className="btn btn-cyan">
            + Nieuwe vraag
          </Link>
          <button onClick={handleExport} disabled={!questions.length} className="btn btn-ghost">
            Exporteren (CSV)
          </button>
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
            Importeren (CSV)
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImport} />
          </label>
        </div>

        {importStatus && <p style={{ color: "var(--green)", fontSize: "0.85rem" }}>{importStatus}</p>}
        {actionError && <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>{actionError}</p>}

        {/* Vragenlijst */}
        {questions.length === 0 ? (
          <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: "40px" }}>
            Nog geen vragen. Voeg er een toe of importeer een CSV.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {questions.map((q) => (
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
                  <Link href={`/admin/quiz/vraag?quiz_id=${quizId}&id=${q.id}`} className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "6px 12px" }}>Bewerken</Link>
                  <button onClick={() => handleDelete(q.id)} className="btn btn-danger" style={{ fontSize: "0.8rem", padding: "6px 12px" }}>Verwijder</button>
                </div>
              </div>
            ))}
          </div>
        )}
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
