"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { Suspense } from "react";
import AdminLayout from "../../AdminLayout";

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
  // blur_reveal
  blur_steps: number;
  // estimate
  estimate_min: number;
  estimate_max: number;
  estimate_unit: string;
  // image_answer (4 image URLs)
  img_opt_a: string;
  img_opt_b: string;
  img_opt_c: string;
  img_opt_d: string;
  // video / audio / image / guess_the_song
  media_url: string;
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
  blur_steps: 5,
  estimate_min: 0,
  estimate_max: 100,
  estimate_unit: "",
  img_opt_a: "",
  img_opt_b: "",
  img_opt_c: "",
  img_opt_d: "",
  media_url: "",
};

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple choice",
  true_false: "Waar / Niet waar",
  image: "Afbeelding als vraag",
  audio: "Audio als vraag",
  blur_reveal: "Vervagend beeld",
  image_answer: "Afbeelding als antwoord",
  video: "Video als vraag",
  estimate: "Schatting (slider)",
  guess_the_song: "Raad het lied (5 sec)",
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) router.push("/admin/login");
      else tokenRef.current = await user.getIdToken();
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    if (!isEdit || !quizId) return;
    (async () => {
      const snap = await getDoc(doc(db, "quizzes", quizId, "questions", questionId));
      if (snap.exists()) {
        const d = snap.data();
        const opts: string[] = d.options ?? [];
        const imgOpts: string[] = d.image_options ?? [];
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
          blur_steps: d.blur_steps ?? 5,
          estimate_min: d.estimate_min ?? 0,
          estimate_max: d.estimate_max ?? 100,
          estimate_unit: d.estimate_unit ?? "",
          img_opt_a: imgOpts[0] ?? "",
          img_opt_b: imgOpts[1] ?? "",
          img_opt_c: imgOpts[2] ?? "",
          img_opt_d: imgOpts[3] ?? "",
          media_url: d.media_url ?? "",
        });
      }
      setLoading(false);
    })();
  }, [isEdit, quizId, questionId]);

  useEffect(() => {
    if (isEdit || !quizId) return;
    (async () => {
      const snap = await getDocs(collection(db, "quizzes", quizId, "questions"));
      setForm((f) => ({ ...f, order: snap.size + 1 }));
    })();
  }, [isEdit, quizId]);

  useEffect(() => {
    if (form.type === "true_false") {
      setForm((f) => ({ ...f, option_a: "Waar", option_b: "Niet waar", option_c: "", option_d: "" }));
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
    const imageOptions = [form.img_opt_a, form.img_opt_b, form.img_opt_c, form.img_opt_d].filter(Boolean);

    const payload: Record<string, unknown> = {
      quiz_id: quizId,
      question_text: form.question_text.trim(),
      type: form.type,
      options: ["multiple_choice", "true_false", "image", "audio", "video", "guess_the_song", "blur_reveal"].includes(form.type) && options.length > 0 ? options : null,
      correct_answer: form.correct_answer,
      time_limit_seconds: form.time_limit_seconds,
      base_points: form.base_points,
      is_double_points: form.is_double_points,
      round: form.round,
      order: form.order,
      media_url: form.media_url || null,
    };

    if (form.type === "blur_reveal") payload.blur_steps = form.blur_steps;
    if (form.type === "estimate") {
      payload.estimate_min = form.estimate_min;
      payload.estimate_max = form.estimate_max;
      payload.estimate_unit = form.estimate_unit;
      payload.options = null;
    }
    if (form.type === "image_answer") {
      payload.image_options = imageOptions;
      payload.options = null;
    }

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

  if (loading) return null;

  const isTrueFalse = form.type === "true_false";
  const hasTextOptions = ["multiple_choice", "true_false", "image", "audio", "video", "blur_reveal", "guess_the_song"].includes(form.type);
  const hasMedia = ["image", "audio", "video", "blur_reveal", "guess_the_song"].includes(form.type);
  const F = { display: "flex", flexDirection: "column" as const, gap: "6px" };
  const L = { color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" };

  return (
    <AdminLayout title={isEdit ? "Vraag bewerken" : "Nieuwe vraag"}>
      <div style={{ maxWidth: "560px" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          <div style={F}>
            <label style={L}>Vraag</label>
            <textarea value={form.question_text} onChange={(e) => set("question_text", e.target.value)} required rows={3} placeholder="Typ de vraag hier..." className="glass-input form-textarea" />
          </div>

          <div style={F}>
            <label style={L}>Type</label>
            <select value={form.type} onChange={(e) => set("type", e.target.value)} className="glass-input form-select">
              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Media URL voor image/audio/video/blur_reveal/guess_the_song */}
          {hasMedia && (
            <div style={F}>
              <label style={L}>
                {form.type === "video" ? "Video URL (YouTube embed of MP4)" :
                 form.type === "audio" || form.type === "guess_the_song" ? "Audio URL (MP3/WAV)" :
                 "Afbeelding URL"}
              </label>
              <input type="url" value={form.media_url} onChange={(e) => set("media_url", e.target.value)}
                placeholder="https://..." className="glass-input" />
            </div>
          )}

          {/* Blur steps voor blur_reveal */}
          {form.type === "blur_reveal" && (
            <div style={F}>
              <label style={L}>Aantal onscherp-stappen (1-10)</label>
              <input type="range" min={1} max={10} value={form.blur_steps}
                onChange={(e) => set("blur_steps", Number(e.target.value))} style={{ accentColor: "var(--cyan)" }} />
              <span style={{ color: "var(--cyan)", fontSize: "0.85rem" }}>{form.blur_steps} stappen</span>
            </div>
          )}

          {/* Afbeelding-opties voor image_answer */}
          {form.type === "image_answer" && (
            <div style={F}>
              <label style={L}>Afbeelding URLs als antwoorden</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {(["img_opt_a", "img_opt_b", "img_opt_c", "img_opt_d"] as const).map((key, i) => (
                  <input key={key} type="url" value={form[key]} onChange={(e) => set(key, e.target.value)}
                    placeholder={`Afbeelding ${["A","B","C","D"][i]} URL`} required={i < 2} className="glass-input" />
                ))}
              </div>
              <div style={F}>
                <label style={L}>Correct antwoord (URL van de juiste afbeelding)</label>
                <select value={form.correct_answer} onChange={(e) => set("correct_answer", e.target.value)} required className="glass-input form-select">
                  <option value="">— Kies het juiste antwoord —</option>
                  {[form.img_opt_a, form.img_opt_b, form.img_opt_c, form.img_opt_d].filter(Boolean).map((url, i) => (
                    <option key={url} value={url}>Afbeelding {["A","B","C","D"][i]}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Schatting velden voor estimate */}
          {form.type === "estimate" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div style={F}>
                  <label style={L}>Minimum</label>
                  <input type="number" value={form.estimate_min} onChange={(e) => set("estimate_min", Number(e.target.value))} className="glass-input form-input" />
                </div>
                <div style={F}>
                  <label style={L}>Maximum</label>
                  <input type="number" value={form.estimate_max} onChange={(e) => set("estimate_max", Number(e.target.value))} className="glass-input form-input" />
                </div>
                <div style={F}>
                  <label style={L}>Eenheid</label>
                  <input type="text" value={form.estimate_unit} onChange={(e) => set("estimate_unit", e.target.value)} placeholder="km, kg, jaar..." className="glass-input form-input" />
                </div>
              </div>
              <div style={F}>
                <label style={L}>Correct antwoord (exact getal)</label>
                <input type="number" value={form.correct_answer} onChange={(e) => set("correct_answer", e.target.value)} required className="glass-input form-input" />
              </div>
            </>
          )}

          {/* Tekst antwoordopties (niet voor estimate en image_answer) */}
          {hasTextOptions && (
            <>
              <div style={F}>
                <label style={L}>Antwoordopties</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {(["option_a", "option_b", "option_c", "option_d"] as const).map((key, i) => (
                    <input key={key} value={form[key]} onChange={(e) => set(key, e.target.value)}
                      placeholder={`Optie ${["A","B","C","D"][i]}`} disabled={isTrueFalse} required={i < 2}
                      className="glass-input" style={isTrueFalse ? { opacity: 0.5 } : undefined} />
                  ))}
                </div>
              </div>

              <div style={F}>
                <label style={L}>Correct antwoord</label>
                <select value={form.correct_answer} onChange={(e) => set("correct_answer", e.target.value)} required className="glass-input form-select">
                  <option value="">— Kies het juiste antwoord —</option>
                  {activeOptions().map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {([["Tijdslimiet (sec)", "time_limit_seconds", 5, 120], ["Punten", "base_points", 0, 9999], ["Ronde", "round", 1, 99], ["Volgorde", "order", 0, 999]] as const).map(([label, field, min, max]) => (
              <div key={field} style={F}>
                <label style={L}>{label}</label>
                <input type="number" min={min} max={max} value={form[field] as number}
                  onChange={(e) => set(field, Number(e.target.value))} className="glass-input form-input" />
              </div>
            ))}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input type="checkbox" checked={form.is_double_points} onChange={(e) => set("is_double_points", e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--cyan)" }} />
            <span style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.9rem" }}>Dubbele punten (finale vraag)</span>
          </label>

          {error && <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>{error}</p>}

          <button type="submit" disabled={saving} className="btn-game">
            {saving ? "Opslaan..." : isEdit ? "Wijzigingen opslaan" : "Vraag toevoegen"}
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <VraagForm />
    </Suspense>
  );
}
