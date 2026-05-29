"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { Suspense } from "react";

interface QuestionForm {
  question_text: string;
  type: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  time_limit_seconds: number;
  base_points: number;
  is_double_points: boolean;
  round: number;
  order: number;
}

const DEFAULT_FORM: QuestionForm = {
  question_text: "",
  type: "multiple_choice",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  correct_answer: "",
  time_limit_seconds: 20,
  base_points: 1000,
  is_double_points: false,
  round: 1,
  order: 0,
};

function VraagForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quizId = searchParams.get("quiz_id") ?? "";
  const questionId = searchParams.get("id") ?? "";
  const isEdit = !!questionId;

  const tokenRef = useRef<string | null>(null);
  const [form, setForm] = useState<QuestionForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) router.push("/admin/login");
      else tokenRef.current = await user.getIdToken();
    });
    return unsub;
  }, [router]);

  // Bestaande vraag laden bij bewerken
  useEffect(() => {
    if (!isEdit || !quizId) return;
    (async () => {
      const snap = await getDoc(doc(db, "quizzes", quizId, "questions", questionId));
      if (snap.exists()) {
        const d = snap.data();
        const opts: string[] = d.options ?? [];
        setForm({
          question_text: d.question_text ?? "",
          type: d.type ?? "multiple_choice",
          option_a: opts[0] ?? "",
          option_b: opts[1] ?? "",
          option_c: opts[2] ?? "",
          option_d: opts[3] ?? "",
          correct_answer: d.correct_answer ?? "",
          time_limit_seconds: d.time_limit_seconds ?? 20,
          base_points: d.base_points ?? 1000,
          is_double_points: d.is_double_points ?? false,
          round: d.round ?? 1,
          order: d.order ?? 0,
        });
      }
      setLoading(false);
    })();
  }, [isEdit, quizId, questionId]);

  // Auto-order voor nieuwe vraag
  useEffect(() => {
    if (isEdit || !quizId) return;
    (async () => {
      const snap = await getDocs(collection(db, "quizzes", quizId, "questions"));
      setForm((f) => ({ ...f, order: snap.size + 1 }));
    })();
  }, [isEdit, quizId]);

  // Bij true/false: opties automatisch instellen
  useEffect(() => {
    if (form.type === "true_false") {
      setForm((f) => ({
        ...f,
        option_a: "Waar",
        option_b: "Niet waar",
        option_c: "",
        option_d: "",
      }));
    }
  }, [form.type]);

  function set(field: keyof QuestionForm, value: string | number | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function activeOptions(): string[] {
    return [form.option_a, form.option_b, form.option_c, form.option_d].filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quizId) { setError("Geen quiz_id"); return; }
    setSaving(true);
    setError("");

    const user = auth.currentUser;
    if (!user) { router.push("/admin/login"); return; }
    const token = await user.getIdToken();

    const options = activeOptions();
    const payload = {
      quiz_id: quizId,
      question_text: form.question_text.trim(),
      type: form.type,
      options: options.length > 0 ? options : null,
      correct_answer: form.correct_answer,
      time_limit_seconds: form.time_limit_seconds,
      base_points: form.base_points,
      is_double_points: form.is_double_points,
      round: form.round,
      order: form.order,
    };

    const url = isEdit ? `/api/host/vragen/${questionId}` : "/api/host/vragen";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      router.push("/admin/quiz");
    } else {
      const json = await res.json();
      setError(json.error ?? "Opslaan mislukt");
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--game-gradient)" }}>
        <p className="text-white/60">Laden...</p>
      </main>
    );
  }

  const isTrueFalse = form.type === "true_false";
  const inputClass = "w-full rounded-xl px-4 py-3 text-white text-sm font-semibold border-2 focus:outline-none focus:border-cyan-400 bg-white/10 border-white/20 placeholder:text-white/30";

  return (
    <main className="min-h-screen p-6" style={{ background: "var(--game-gradient)" }}>
      <div className="max-w-xl mx-auto flex flex-col gap-5">

        <div className="flex items-center justify-between">
          <h1 className="text-white font-black text-2xl">
            {isEdit ? "Vraag bewerken" : "Nieuwe vraag"}
          </h1>
          <a href="/admin/quiz" className="text-white/50 text-sm hover:text-white transition-colors">
            ← Terug
          </a>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Vraagtekst */}
          <div className="flex flex-col gap-1.5">
            <label className="text-white/60 text-xs font-bold uppercase tracking-wider">Vraag</label>
            <textarea
              value={form.question_text}
              onChange={(e) => set("question_text", e.target.value)}
              required
              rows={3}
              placeholder="Typ de vraag hier..."
              className={inputClass}
            />
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-white/60 text-xs font-bold uppercase tracking-wider">Type</label>
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              className={inputClass}
            >
              <option value="multiple_choice">Multiple choice</option>
              <option value="true_false">Waar / Niet waar</option>
              <option value="image">Afbeelding</option>
              <option value="audio">Audio</option>
            </select>
          </div>

          {/* Antwoordopties */}
          <div className="flex flex-col gap-1.5">
            <label className="text-white/60 text-xs font-bold uppercase tracking-wider">Antwoordopties</label>
            <div className="grid grid-cols-2 gap-2">
              {(["option_a", "option_b", "option_c", "option_d"] as const).map((key, i) => (
                <input
                  key={key}
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={`Optie ${["A", "B", "C", "D"][i]}`}
                  disabled={isTrueFalse}
                  required={i < 2}
                  className={inputClass + (isTrueFalse ? " opacity-50 cursor-not-allowed" : "")}
                />
              ))}
            </div>
          </div>

          {/* Correct antwoord */}
          <div className="flex flex-col gap-1.5">
            <label className="text-white/60 text-xs font-bold uppercase tracking-wider">Correct antwoord</label>
            <select
              value={form.correct_answer}
              onChange={(e) => set("correct_answer", e.target.value)}
              required
              className={inputClass}
            >
              <option value="">— Kies het juiste antwoord —</option>
              {activeOptions().map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Instellingen */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-white/60 text-xs font-bold uppercase tracking-wider">Tijdslimiet (sec)</label>
              <input
                type="number"
                min={5} max={120}
                value={form.time_limit_seconds}
                onChange={(e) => set("time_limit_seconds", Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-white/60 text-xs font-bold uppercase tracking-wider">Punten</label>
              <input
                type="number"
                min={0}
                value={form.base_points}
                onChange={(e) => set("base_points", Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-white/60 text-xs font-bold uppercase tracking-wider">Ronde</label>
              <input
                type="number"
                min={1}
                value={form.round}
                onChange={(e) => set("round", Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-white/60 text-xs font-bold uppercase tracking-wider">Volgorde</label>
              <input
                type="number"
                min={0}
                value={form.order}
                onChange={(e) => set("order", Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>

          {/* Dubbele punten */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_double_points}
              onChange={(e) => set("is_double_points", e.target.checked)}
              className="w-5 h-5 rounded accent-cyan-400"
            />
            <span className="text-white/70 font-semibold text-sm">Dubbele punten (finale vraag)</span>
          </label>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 rounded-2xl font-black text-white text-lg transition-all active:scale-95 disabled:opacity-60"
            style={{ background: "var(--cyan)", boxShadow: "var(--crt-glow)" }}
          >
            {saving ? "Opslaan..." : isEdit ? "Wijzigingen opslaan" : "Vraag toevoegen"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--game-gradient)" }}>
        <p className="text-white/60">Laden...</p>
      </main>
    }>
      <VraagForm />
    </Suspense>
  );
}
