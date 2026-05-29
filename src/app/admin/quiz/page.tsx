"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, orderBy, limit, getDocs } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import Link from "next/link";

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

  const handleSignOut = async () => { await signOut(auth); router.push("/admin/login"); };

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10 gap-8" style={{ background: "var(--game-gradient)" }}>

      {/* Hamburger menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <nav
            className="relative ml-auto h-full w-64 flex flex-col gap-1 p-6 z-50"
            style={{ background: "var(--game-gradient)", borderLeft: "1px solid rgba(255,255,255,0.15)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <span className="text-white font-black text-lg">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="text-white/50 hover:text-white text-2xl leading-none">✕</button>
            </div>
            <a href="/admin/quiz" className="flex items-center gap-3 px-4 py-3 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-semibold" onClick={() => setMenuOpen(false)}>
              <span>📝</span> Vragen beheren
            </a>
            <a href="/admin" className="flex items-center gap-3 px-4 py-3 text-white/80 hover:text-white hover:bg-white/10 transition-colors font-semibold" onClick={() => setMenuOpen(false)}>
              <span>🎮</span> Dashboard
            </a>
            <div className="mt-auto">
              <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3 text-red-400/80 hover:text-red-400 hover:bg-white/10 transition-colors font-semibold">
                <span>→</span> Uitloggen
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Topbar */}
      <div className="w-full max-w-2xl flex items-center justify-end">
        <button onClick={() => setMenuOpen(true)} className="flex flex-col gap-1.5 p-2 text-white/60 hover:text-white transition-colors" aria-label="Menu">
          <span className="block w-6 h-0.5 bg-current" />
          <span className="block w-6 h-0.5 bg-current" />
          <span className="block w-6 h-0.5 bg-current" />
        </button>
      </div>

      {/* Logo */}
      <img src="/logo-vierkant.png" alt="Hoekies Quiz Rondje" className="w-36 object-contain drop-shadow-xl" />

      {/* Titel */}
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-white font-black text-2xl">Vragen beheren</h1>
        <p className="text-white/40 text-sm mt-1">{questions.length} vragen</p>
      </div>

      {/* Acties */}
      <div className="w-full max-w-2xl flex flex-wrap justify-center gap-3">
        <Link href={`/admin/quiz/vraag?quiz_id=${quizId}`} className="px-5 py-2.5 font-bold text-white text-sm transition-all active:scale-95" style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}>
          + Nieuwe vraag
        </Link>
        <button onClick={handleExport} disabled={!questions.length} className="px-5 py-2.5 font-bold text-white/80 text-sm border border-white/20 hover:border-white/40 transition-all disabled:opacity-40">
          Exporteren (CSV)
        </button>
        <label className="px-5 py-2.5 font-bold text-white/80 text-sm border border-white/20 hover:border-white/40 transition-all cursor-pointer">
          Importeren (CSV)
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </label>
      </div>

      {importStatus && <p className="text-green-400 text-sm text-center">{importStatus}</p>}
      {actionError && <p className="text-red-400 text-sm text-center">{actionError}</p>}

      {/* Vragenlijst */}
      <div className="w-full max-w-2xl flex flex-col gap-2">
        {questions.length === 0 ? (
          <div className="p-8 text-center text-white/40" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
            Nog geen vragen. Voeg er een toe of importeer een CSV.
          </div>
        ) : (
          questions.map((q) => (
            <div key={q.id} className="p-4 flex items-start gap-3" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white/30 text-xs">R{q.round} #{q.order}</span>
                  <span className="text-xs px-2 py-0.5 font-semibold" style={{ background: "rgba(6,182,212,0.2)", color: "var(--cyan)" }}>{q.type}</span>
                  {q.is_double_points && <span className="text-xs px-2 py-0.5 font-semibold bg-orange-500/20 text-orange-400">2x</span>}
                </div>
                <p className="text-white font-semibold text-sm leading-snug truncate">{q.question_text}</p>
                <p className="text-green-400 text-xs">✓ {q.correct_answer}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link href={`/admin/quiz/vraag?quiz_id=${quizId}&id=${q.id}`} className="text-xs px-3 py-1.5 font-semibold text-white/60 hover:text-white border border-white/20 hover:border-white/40 transition-all">
                  Bewerken
                </Link>
                <button onClick={() => handleDelete(q.id)} className="text-xs px-3 py-1.5 font-semibold text-red-400/60 hover:text-red-400 border border-red-400/20 hover:border-red-400/40 transition-all">
                  Verwijder
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
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
