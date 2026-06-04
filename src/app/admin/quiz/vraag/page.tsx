"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { compressImage, uploadMedia } from "@/lib/media";
import { scramble } from "@/lib/text";
import QuestionPreview, { PreviewQuestion } from "./QuestionPreview";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
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
  // video / audio / image
  media_url: string;
  guess_duration: 5 | 10 | 15 | 20;
  audio_start: number;
  video_start: number;
  clip_duration: 5 | 10 | 15 | 20;
  answer_mode: "multiple_choice" | "true_false" | "open";
  video_source: "youtube" | "upload";
  video_muted: boolean;
  // match
  left_1: string;
  left_2: string;
  left_3: string;
  right_1: string;
  right_2: string;
  right_3: string;
  match_a: string; // welk right-index hoort bij left_1 (0/1/2)
  match_b: string;
  match_c: string;
  // multi_select — welke optie-indices juist zijn (bv. "0,2")
  multi_idx: string;
  // clues — tot 4 hints
  clue_1: string;
  clue_2: string;
  clue_3: string;
  clue_4: string;
}

const DEFAULT_FORM: QuestionForm = {
  question_text: "",
  type: "image",
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
  guess_duration: 5,
  audio_start: 0,
  video_start: 0,
  clip_duration: 5,
  answer_mode: "multiple_choice",
  video_source: "youtube",
  video_muted: false,
  left_1: "",
  left_2: "",
  left_3: "",
  right_1: "",
  right_2: "",
  right_3: "",
  match_a: "0",
  match_b: "1",
  match_c: "2",
  multi_idx: "",
  clue_1: "",
  clue_2: "",
  clue_3: "",
  clue_4: "",
};

const TYPE_LABELS: Record<string, string> = {
  image: "Afbeelding als vraag",
  audio: "Audio / raad het lied",
  blur_reveal: "Vervagend beeld",
  image_answer: "Afbeelding als antwoord",
  video: "Video als vraag",
  estimate: "Schatting (slider)",
  match: "Koppelen (A→1, B→2, C→3)",
  multi_select: "Meerdere juiste antwoorden",
  anagram: "Anagram (ontwar het woord)",
  gatentekst: "Gatentekst (vul aan)",
  clues: "Wie ben ik? (hints)",
  zoom_reveal: "Inzoomende afbeelding",
  tile_reveal: "Puzzelafbeelding",
  four_pics: "Vier foto's, één antwoord",
};

// Zet een geplakte afbeeldings-URL om naar een direct bruikbare link.
// Wikipedia/Wikimedia "File:"-pagina's (HTML) → Special:FilePath (de echte afbeelding).
function normalizeImageUrl(url: string): string {
  const m = url.match(/^(https?:\/\/[^/]*\.?wik(?:ipedia|imedia|tionary)\.org)\/wiki\/(?:File|Bestand|Image):(.+)$/i);
  if (m) return `${m[1]}/wiki/Special:FilePath/${m[2].split("#")[0]}`;
  return url.trim();
}

// Bouwt uit het formulier een vraag-object voor de interactieve voorbeeldweergave
// (zelfde opties/correct_answer-logica als handleSubmit).
function buildPreview(form: QuestionForm): PreviewQuestion {
  const mediaToggle = ["image", "blur_reveal", "video", "audio", "zoom_reveal", "tile_reveal"].includes(form.type);
  let options = [form.option_a, form.option_b, form.option_c, form.option_d].filter(Boolean);
  if (mediaToggle && form.answer_mode === "true_false") options = ["Waar", "Niet waar"];
  if (mediaToggle && form.answer_mode === "open") options = [];

  let correct = form.correct_answer;
  if (form.type === "match") correct = JSON.stringify({ 0: Number(form.match_a), 1: Number(form.match_b), 2: Number(form.match_c) });
  if (form.type === "multi_select") {
    const idxs = form.multi_idx.split(",").map((s) => Number(s)).filter((n) => !Number.isNaN(n));
    correct = JSON.stringify(idxs.map((i) => options[i]).filter(Boolean).slice().sort());
  }

  return {
    id: "preview",
    type: form.type,
    question_text: form.question_text,
    options,
    correct_answer: correct,
    media_url: form.media_url,
    image_options: [form.img_opt_a, form.img_opt_b, form.img_opt_c, form.img_opt_d],
    clues: [form.clue_1, form.clue_2, form.clue_3, form.clue_4].filter(Boolean),
    answer_mode: mediaToggle ? form.answer_mode : undefined,
    estimate_min: form.estimate_min,
    estimate_max: form.estimate_max,
    estimate_unit: form.estimate_unit,
    blur_steps: form.blur_steps,
    time_limit_seconds: form.time_limit_seconds,
    base_points: form.base_points,
    is_double_points: form.is_double_points,
  };
}

function VraagForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quizId = searchParams.get("quiz_id") ?? "";
  const questionId = searchParams.get("id") ?? "";
  const isEdit = !!questionId;

  const tokenRef = useRef<string | null>(null);
  const [form, setForm] = useState<QuestionForm>(DEFAULT_FORM);
  const formRef = useRef(form);
  formRef.current = form;
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

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
          guess_duration: ([5, 10, 15, 20].includes(d.guess_duration) ? d.guess_duration : 5) as 5 | 10 | 15 | 20,
          audio_start: d.audio_start ?? 0,
          video_start: d.video_start ?? 0,
          clip_duration: ((v) => [5, 10, 15, 20].includes(v) ? v : 5)(d.clip_duration ?? d.guess_duration) as 5 | 10 | 15 | 20,
          answer_mode: d.answer_mode === "true_false" ? "true_false" : d.answer_mode === "open" ? "open" : "multiple_choice",
          video_source: (d.type === "video" && d.media_url && !/youtube|youtu\.be/.test(d.media_url)) ? "upload" : "youtube",
          video_muted: !!d.video_muted,
          left_1: (d.left_items ?? [])[0] ?? "",
          left_2: (d.left_items ?? [])[1] ?? "",
          left_3: (d.left_items ?? [])[2] ?? "",
          right_1: (d.right_items ?? [])[0] ?? "",
          right_2: (d.right_items ?? [])[1] ?? "",
          right_3: (d.right_items ?? [])[2] ?? "",
          match_a: (() => { try { return String(JSON.parse(d.correct_answer ?? "{}")[0] ?? "0"); } catch { return "0"; } })(),
          match_b: (() => { try { return String(JSON.parse(d.correct_answer ?? "{}")[1] ?? "1"); } catch { return "1"; } })(),
          match_c: (() => { try { return String(JSON.parse(d.correct_answer ?? "{}")[2] ?? "2"); } catch { return "2"; } })(),
          multi_idx: (() => { if (d.type !== "multi_select") return ""; try { const set: string[] = JSON.parse(d.correct_answer ?? "[]"); return opts.map((o, i) => (set.includes(o) ? String(i) : "")).filter(Boolean).join(","); } catch { return ""; } })(),
          clue_1: (d.clues ?? [])[0] ?? "",
          clue_2: (d.clues ?? [])[1] ?? "",
          clue_3: (d.clues ?? [])[2] ?? "",
          clue_4: (d.clues ?? [])[3] ?? "",
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

  // ── Media-upload state ───────────────────────────────────────────────
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [uploading, setUploading] = useState(false);
  // Naar welk formulierveld het bijgesneden resultaat geschreven wordt
  const [cropTarget, setCropTarget] = useState<keyof QuestionForm>("media_url");
  const imgRef = useRef<HTMLImageElement>(null);

  function onImageFile(e: React.ChangeEvent<HTMLInputElement>, target: keyof QuestionForm = "media_url") {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropTarget(target);
    const reader = new FileReader();
    reader.onload = (ev) => { setCropSrc(ev.target?.result as string); setCrop(undefined); setScale(1); setCompletedCrop(undefined); };
    reader.readAsDataURL(file);
  }

  // Open de bijsnij-/inzoom-editor op een bestaande (geplakte of geüploade) URL
  function cropFromUrl(url: string, target: keyof QuestionForm) {
    if (!url) return;
    setCropTarget(target);
    setCrop(undefined); setScale(1); setCompletedCrop(undefined);
    setCropSrc(url);
  }

  // Plakken met Ctrl+V (bv. een schermknip uit het Windows Knipprogramma)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      let imgFile: File | null = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) { imgFile = items[i].getAsFile(); break; }
      }
      if (!imgFile) return;
      const f = formRef.current;
      const single = ["image", "blur_reveal", "match", "zoom_reveal", "tile_reveal"];
      const multi = ["image_answer", "four_pics"];
      let target: keyof QuestionForm | null = null;
      if (single.includes(f.type)) target = "media_url";
      else if (multi.includes(f.type)) {
        const slots: (keyof QuestionForm)[] = ["img_opt_a", "img_opt_b", "img_opt_c", "img_opt_d"];
        target = slots.find((k) => !f[k]) ?? "img_opt_a"; // eerste lege slot
      }
      if (!target) return; // geen afbeeldingsvraag → niets doen
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCropTarget(target!);
        setCrop(undefined); setScale(1); setCompletedCrop(undefined);
        setCropSrc(ev.target?.result as string);
      };
      reader.readAsDataURL(imgFile);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function onCropImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    // Vierkante uitsnede (1:1)
    setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, 1, w, h), w, h));
  }

  async function saveCroppedImage() {
    if (!imgRef.current || !quizId) { setError("Geen afbeelding"); return; }
    setUploading(true); setError("");
    try {
      let blob: Blob;
      if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
        // Uitsnede gemaakt → croppen
        const sx = imgRef.current.naturalWidth / imgRef.current.width;
        const sy = imgRef.current.naturalHeight / imgRef.current.height;
        const canvas = document.createElement("canvas");
        canvas.width = completedCrop.width * sx;
        canvas.height = completedCrop.height * sy;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(imgRef.current, completedCrop.x * sx, completedCrop.y * sy, completedCrop.width * sx, completedCrop.height * sy, 0, 0, canvas.width, canvas.height);
        blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
      } else {
        // Geen uitsnede → hele afbeelding gebruiken
        const canvas = document.createElement("canvas");
        canvas.width = imgRef.current.naturalWidth;
        canvas.height = imgRef.current.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(imgRef.current, 0, 0);
        blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
      }
      const compressed = await compressImage(blob, 1280, 0.82);
      const url = await uploadMedia(compressed, "image");
      setForm((f) => ({ ...f, [cropTarget]: url }));
      setCropSrc(null);
    } catch (err) {
      setError("Bijsnijden mislukt (mogelijk staat de bron geen bewerking toe): " + (err as Error).message);
    }
    setUploading(false);
  }

  async function onAudioFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !quizId) return;
    setUploading(true); setError("");
    try {
      const url = await uploadMedia(file, "video"); // audio = video-resource bij Cloudinary
      setForm((f) => ({ ...f, media_url: url }));
    } catch (err) { setError("Upload mislukt: " + (err as Error).message); }
    setUploading(false);
  }

  async function onVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !quizId) return;
    setUploading(true); setError("");
    try {
      const url = await uploadMedia(file, "video");
      setForm((f) => ({ ...f, media_url: url }));
    } catch (err) { setError("Upload mislukt: " + (err as Error).message); }
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quizId) { setError("Geen quiz_id"); return; }
    setSaving(true);
    setError("");

    const user = auth.currentUser;
    if (!user) { router.push("/admin/login"); return; }
    const token = await user.getIdToken();

    const mediaTypeUsesToggle = ["image", "blur_reveal", "video", "audio", "zoom_reveal", "tile_reveal"].includes(form.type);
    let options = activeOptions();
    if (mediaTypeUsesToggle && form.answer_mode === "true_false") {
      options = ["Waar", "Niet waar"];
    }
    if (mediaTypeUsesToggle && form.answer_mode === "open") {
      options = [];
    }
    const imageOptions = [form.img_opt_a, form.img_opt_b, form.img_opt_c, form.img_opt_d].filter(Boolean);

    const payload: Record<string, unknown> = {
      quiz_id: quizId,
      question_text: form.question_text.trim(),
      type: form.type,
      options: ["multiple_choice", "true_false", "image", "audio", "video", "blur_reveal", "zoom_reveal", "tile_reveal", "multi_select"].includes(form.type) && options.length > 0 ? options : null,
      correct_answer: form.correct_answer,
      time_limit_seconds: form.time_limit_seconds,
      base_points: form.base_points,
      is_double_points: form.is_double_points,
      round: form.round,
      order: form.order,
      media_url: form.media_url || null,
    };

    if (mediaTypeUsesToggle) payload.answer_mode = form.answer_mode;
    if (form.type === "blur_reveal") payload.blur_steps = form.blur_steps;
    if (form.type === "audio") {
      payload.audio_start = form.audio_start;
      payload.clip_duration = form.clip_duration;
    }
    if (form.type === "video") {
      payload.video_start = form.video_start;
      payload.clip_duration = form.clip_duration;
      payload.video_muted = form.video_muted;
    }
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
    if (form.type === "match") {
      payload.left_items = [form.left_1, form.left_2, form.left_3].filter(Boolean);
      payload.right_items = [form.right_1, form.right_2, form.right_3].filter(Boolean);
      payload.correct_answer = JSON.stringify({ 0: Number(form.match_a), 1: Number(form.match_b), 2: Number(form.match_c) });
      payload.options = null;
    }
    if (form.type === "multi_select") {
      const idxs = form.multi_idx.split(",").map((s) => Number(s)).filter((n) => !Number.isNaN(n));
      const correctVals = idxs.map((i) => options[i]).filter(Boolean);
      payload.correct_answer = JSON.stringify(correctVals.slice().sort());
    }
    if (form.type === "four_pics") {
      payload.image_options = imageOptions;
      payload.options = null;
    }
    if (form.type === "clues") {
      payload.clues = [form.clue_1, form.clue_2, form.clue_3, form.clue_4].filter(Boolean);
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
  const usesToggle = ["image", "blur_reveal", "video", "audio", "zoom_reveal", "tile_reveal"].includes(form.type);
  const toggleIsTF = usesToggle && form.answer_mode === "true_false";
  // 4-keuze tekstvelden tonen: zuivere keuze-typen + media-typen in 4-keuze modus
  const hasTextOptions = ["multiple_choice", "true_false"].includes(form.type) || (usesToggle && form.answer_mode === "multiple_choice");
  const isMatch = form.type === "match";
  const F = { display: "flex", flexDirection: "column" as const, gap: "6px" };
  const L = { color: "var(--muted)", fontSize: "0.75rem", fontWeight: 700 };
  const tfWaardes = ["Waar", "Niet waar"];

  // Afbeelding-slot met vierkante preview, URL, upload én bijsnijden/inzoomen
  const imageSlot = (key: keyof QuestionForm, placeholder: string, required: boolean) => {
    const val = form[key] as string;
    return (
      <div key={key} style={{ ...F, gap: "6px" }}>
        {val && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={val} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "8px", background: "rgba(255,255,255,0.05)" }} />
        )}
        <input type="url" value={val} onChange={(e) => set(key, normalizeImageUrl(e.target.value))} placeholder={placeholder} required={required} className="glass-input" />
        <div style={{ display: "flex", gap: "6px" }}>
          <label style={{ flex: 1, textAlign: "center", color: "var(--muted)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px", cursor: "pointer", fontSize: "0.78rem" }}>
            📁 Upload
            <input type="file" accept="image/*" onChange={(e) => onImageFile(e, key)} style={{ display: "none" }} />
          </label>
          {val && (
            <button type="button" onClick={() => cropFromUrl(val, key)}
              style={{ color: "var(--cyan)", background: "none", border: "1px solid rgba(13,180,171,0.4)", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}>
              ✂️ Bijsnijden
            </button>
          )}
        </div>
      </div>
    );
  };

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

          {/* Bijsnij-/inzoom-editor (vierkant) — werkt voor elke afbeelding */}
          {cropSrc && (
            <div style={{ ...F, gap: "10px", padding: "12px", borderRadius: "12px", background: "rgba(13,180,171,0.06)", border: "1px solid rgba(13,180,171,0.3)" }}>
              <label style={L}>Bijsnijden / inzoomen (vierkant)</label>
              <input type="range" min={0.5} max={3} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ accentColor: "var(--cyan)" }} />
              <div style={{ maxWidth: "100%", overflow: "hidden", borderRadius: "10px" }}>
                <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} aspect={1}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img ref={imgRef} src={cropSrc} crossOrigin="anonymous" alt="Crop" onLoad={onCropImgLoad} style={{ transform: `scale(${scale})`, transformOrigin: "top left", maxWidth: "100%" }} />
                </ReactCrop>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" onClick={saveCroppedImage} disabled={uploading} className="btn-game" style={{ fontSize: "0.9rem", padding: "10px 16px" }}>{uploading ? "Uploaden..." : "Bijsnijden + opslaan"}</button>
                <button type="button" onClick={() => setCropSrc(null)} style={{ color: "var(--muted)", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontSize: "0.82rem" }}>Annuleren</button>
              </div>
            </div>
          )}

          {/* Afbeelding / vervagend beeld / koppelvraag / zoom / puzzel: upload + crop + compress, of URL */}
          {(form.type === "image" || form.type === "blur_reveal" || form.type === "match" || form.type === "zoom_reveal" || form.type === "tile_reveal") && (
            <div style={F}>
              <label style={L}>Afbeelding{form.type === "match" ? " (optioneel)" : ""}</label>
              {form.media_url && !cropSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.media_url} alt="Preview" style={{ width: "min(100%, 220px)", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "10px", background: "rgba(255,255,255,0.05)" }} />
              )}
              <input type="file" accept="image/*" onChange={(e) => onImageFile(e, "media_url")} className="glass-input" style={{ padding: "8px" }} />
              <label style={{ ...L, marginTop: "4px" }}>Of plak een afbeelding-URL</label>
              <input type="url" value={form.media_url} onChange={(e) => set("media_url", normalizeImageUrl(e.target.value))} placeholder="https://..." className="glass-input" />
              <span style={{ color: "var(--cyan)", fontSize: "0.78rem" }}>📋 Of plak een schermknip met <strong>Ctrl+V</strong> (Windows Knipprogramma)</span>
              {form.media_url && !cropSrc && (
                <button type="button" onClick={() => cropFromUrl(form.media_url, "media_url")}
                  style={{ alignSelf: "flex-start", color: "var(--cyan)", background: "none", border: "1px solid rgba(13,180,171,0.4)", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                  ✂️ Bijsnijden / inzoomen
                </button>
              )}
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

          {/* Audio: upload MP3 + startpunt + duur */}
          {form.type === "audio" && (
            <div style={F}>
              <label style={L}>Audiobestand (MP3)</label>
              {form.media_url && <audio controls src={form.media_url} style={{ width: "100%" }} />}
              <input type="file" accept="audio/*" onChange={onAudioFile} className="glass-input" style={{ padding: "8px" }} />
              {uploading && <span style={{ color: "var(--cyan)", fontSize: "0.82rem" }}>Uploaden...</span>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={F}>
                  <label style={L}>Startpunt (sec)</label>
                  <input type="number" min={0} value={form.audio_start} onChange={(e) => set("audio_start", Number(e.target.value))} className="glass-input" />
                </div>
                <div style={F}>
                  <label style={L}>Afspeelduur</label>
                  <div style={{ display: "flex", gap: "12px", paddingTop: "8px" }}>
                    {([5, 10, 15, 20] as const).map((sec) => (
                      <label key={sec} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                        <input type="radio" name="clip_duration" checked={form.clip_duration === sec} onChange={() => set("clip_duration", sec)} style={{ accentColor: "var(--cyan)" }} />
                        <span style={{ color: form.clip_duration === sec ? "var(--cyan)" : "var(--text)", fontWeight: 600, fontSize: "0.9rem" }}>{sec}s</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Video: YouTube of MP4-upload + startpunt + duur */}
          {form.type === "video" && (
            <div style={F}>
              <label style={L}>Videobron</label>
              <div style={{ display: "flex", gap: "16px" }}>
                {(["youtube", "upload"] as const).map((src) => (
                  <label key={src} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input type="radio" name="video_source" checked={form.video_source === src} onChange={() => set("video_source", src)} style={{ accentColor: "var(--cyan)" }} />
                    <span style={{ color: form.video_source === src ? "var(--cyan)" : "var(--text)", fontWeight: 600 }}>{src === "youtube" ? "YouTube" : "MP4 uploaden"}</span>
                  </label>
                ))}
              </div>
              {form.video_source === "youtube" ? (
                <input type="url" value={form.media_url} onChange={(e) => set("media_url", e.target.value)} placeholder="https://youtube.com/watch?v=..." className="glass-input" />
              ) : (
                <>
                  {form.media_url && <video controls src={form.media_url} style={{ width: "100%", maxHeight: "200px", borderRadius: "10px" }} />}
                  <input type="file" accept="video/mp4" onChange={onVideoFile} className="glass-input" style={{ padding: "8px" }} />
                  {uploading && <span style={{ color: "var(--cyan)", fontSize: "0.82rem" }}>Uploaden...</span>}
                </>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={F}>
                  <label style={L}>Startpunt (sec)</label>
                  <input type="number" min={0} value={form.video_start} onChange={(e) => set("video_start", Number(e.target.value))} className="glass-input" />
                </div>
                <div style={F}>
                  <label style={L}>Afspeelduur</label>
                  <div style={{ display: "flex", gap: "12px", paddingTop: "8px" }}>
                    {([5, 10, 15, 20] as const).map((sec) => (
                      <label key={sec} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                        <input type="radio" name="clip_duration_v" checked={form.clip_duration === sec} onChange={() => set("clip_duration", sec)} style={{ accentColor: "var(--cyan)" }} />
                        <span style={{ color: form.clip_duration === sec ? "var(--cyan)" : "var(--text)", fontWeight: 600, fontSize: "0.9rem" }}>{sec}s</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", marginTop: "4px" }}>
                <input type="checkbox" checked={!form.video_muted} onChange={(e) => set("video_muted", !e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--cyan)" }} />
                <span style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.9rem" }}>Geluid afspelen</span>
              </label>
            </div>
          )}

          {/* Antwoordtype-toggle voor image/blur/video */}
          {usesToggle && (
            <div style={F}>
              <label style={{ ...L, textAlign: "center" }}>Antwoordtype</label>
              <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                {([["multiple_choice", "4 keuzes"], ["true_false", "Waar / Onjuist"], ["open", "Open vraag"]] as const).map(([mode, lbl]) => {
                  const active = form.answer_mode === mode;
                  return (
                    <button type="button" key={mode} onClick={() => set("answer_mode", mode)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "8px 16px", borderRadius: "10px",
                        border: `2px solid ${active ? "var(--cyan)" : "rgba(255,255,255,0.2)"}`, background: active ? "rgba(13,180,171,0.15)" : "transparent" }}>
                      <input type="radio" name="answer_mode" checked={active} readOnly style={{ accentColor: "var(--cyan)", pointerEvents: "none" }} />
                      <span style={{ color: active ? "var(--cyan)" : "var(--text)", fontWeight: 600 }}>{lbl}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Waar/Niet waar — vink het juiste antwoord aan (groen vinkje) */}
          {toggleIsTF && (
            <div style={F}>
              <label style={L}>Juiste antwoord — vink aan</label>
              <div style={{ display: "flex", gap: "10px" }}>
                {tfWaardes.map((w) => {
                  const isCorrect = form.correct_answer === w;
                  return (
                    <button type="button" key={w} onClick={() => set("correct_answer", w)}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "12px",
                        borderRadius: "10px", cursor: "pointer", fontWeight: 700, fontSize: "1rem", color: "#fff",
                        border: `2px solid ${isCorrect ? "var(--green)" : "rgba(255,255,255,0.2)"}`,
                        background: isCorrect ? "rgba(34,197,94,0.15)" : "transparent" }}>
                      <span style={{ width: "22px", height: "22px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center",
                        border: `2px solid ${isCorrect ? "var(--green)" : "rgba(255,255,255,0.3)"}`, background: isCorrect ? "var(--green)" : "transparent", fontWeight: 900 }}>
                        {isCorrect ? "✓" : ""}
                      </span>
                      {w}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Afbeelding-opties voor image_answer */}
          {form.type === "image_answer" && (
            <div style={F}>
              <label style={L}>Afbeeldingen als antwoorden (vierkant)</label>
              <span style={{ color: "var(--cyan)", fontSize: "0.76rem" }}>📋 Ctrl+V plakt een schermknip in het eerste lege vak</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {(["img_opt_a", "img_opt_b", "img_opt_c", "img_opt_d"] as const).map((key, i) => (
                  imageSlot(key, `Afbeelding ${["A", "B", "C", "D"][i]}`, i < 2)
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

          {/* Open vraag — vrij typen (los type, media-antwoordtype, anagram of gatentekst) */}
          {(form.type === "open" || form.type === "anagram" || form.type === "gatentekst" || (usesToggle && form.answer_mode === "open")) && (
            <div style={F}>
              <label style={L}>Correct antwoord{form.type === "anagram" ? " (het woord dat door elkaar geschud wordt)" : ""}</label>
              <input type="text" value={form.correct_answer} onChange={(e) => set("correct_answer", e.target.value)} required placeholder="Het juiste antwoord" className="glass-input" />
              {form.type === "gatentekst" && <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Gebruik <strong>___</strong> in de vraagtekst voor het gat.</span>}
              {form.type === "anagram" && form.correct_answer && <span style={{ color: "var(--cyan)", fontSize: "0.82rem" }}>Speler ziet bijv.: <strong>{scramble(form.correct_answer, "preview")}</strong></span>}
              <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Speler typt zelf. Hoofdletters/spaties tellen niet mee.</span>
            </div>
          )}

          {/* Wie ben ik? — hints + correct antwoord */}
          {form.type === "clues" && (
            <>
              <div style={F}>
                <label style={L}>Hints (verschijnen één voor één)</label>
                {(["clue_1", "clue_2", "clue_3", "clue_4"] as const).map((k, i) => (
                  <input key={k} value={form[k]} onChange={(e) => set(k, e.target.value)}
                    placeholder={`Hint ${i + 1}${i < 2 ? "" : " (optioneel)"}`} required={i < 2} className="glass-input" />
                ))}
              </div>
              <div style={F}>
                <label style={L}>Correct antwoord</label>
                <input type="text" value={form.correct_answer} onChange={(e) => set("correct_answer", e.target.value)} required placeholder="Wie of wat is het?" className="glass-input" />
                <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Speler typt zelf. Hoofdletters/spaties tellen niet mee.</span>
              </div>
            </>
          )}

          {/* Vier foto's, één antwoord */}
          {form.type === "four_pics" && (
            <>
              <div style={F}>
                <label style={L}>Vier afbeeldingen (vierkant)</label>
                <span style={{ color: "var(--cyan)", fontSize: "0.76rem" }}>📋 Ctrl+V plakt een schermknip in het eerste lege vak</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {(["img_opt_a", "img_opt_b", "img_opt_c", "img_opt_d"] as const).map((key, i) => (
                    imageSlot(key, `Afbeelding ${i + 1}`, true)
                  ))}
                </div>
              </div>
              <div style={F}>
                <label style={L}>Correct antwoord (het verbindende woord)</label>
                <input type="text" value={form.correct_answer} onChange={(e) => set("correct_answer", e.target.value)} required placeholder="Het woord dat de 4 foto's verbindt" className="glass-input" />
                <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Speler typt zelf. Hoofdletters/spaties tellen niet mee.</span>
              </div>
            </>
          )}

          {/* Meerdere juiste antwoorden — vink álle juiste aan */}
          {form.type === "multi_select" && (() => {
            const selected = form.multi_idx.split(",").filter(Boolean);
            const toggle = (i: number) => {
              const s = new Set(selected);
              const key = String(i);
              if (s.has(key)) s.delete(key); else s.add(key);
              set("multi_idx", [...s].sort().join(","));
            };
            return (
              <div style={F}>
                <label style={L}>Antwoordopties — vink álle juiste antwoorden aan</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {(["option_a", "option_b", "option_c", "option_d"] as const).map((key, i) => {
                    const val = form[key];
                    const isCorrect = !!val && selected.includes(String(i));
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button type="button" title="Markeer als juist antwoord" onClick={() => { if (val) toggle(i); }}
                          style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "8px", cursor: val ? "pointer" : "not-allowed",
                            border: `2px solid ${isCorrect ? "var(--green)" : "rgba(255,255,255,0.2)"}`,
                            background: isCorrect ? "var(--green)" : "transparent",
                            color: "#fff", fontWeight: 900, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isCorrect ? "✓" : ""}
                        </button>
                        <input value={val} onChange={(e) => set(key, e.target.value)}
                          placeholder={`Optie ${["A", "B", "C", "D"][i]}`} required={i < 2} className="glass-input" style={{ flex: 1 }} />
                      </div>
                    );
                  })}
                </div>
                {selected.length === 0 && <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Vink minstens één juist antwoord aan (meerdere mag).</span>}
              </div>
            );
          })()}

          {/* Match koppelen */}
          {form.type === "match" && (
            <div style={F}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={F}>
                  <label style={L}>Linker items (A / B / C)</label>
                  {(["left_1", "left_2", "left_3"] as const).map((k, i) => (
                    <input key={k} value={form[k]} onChange={(e) => set(k, e.target.value)}
                      placeholder={`Item ${["A","B","C"][i]}`} required className="glass-input" />
                  ))}
                </div>
                <div style={F}>
                  <label style={L}>Rechter items (1 / 2 / 3)</label>
                  {(["right_1", "right_2", "right_3"] as const).map((k, i) => (
                    <input key={k} value={form[k]} onChange={(e) => set(k, e.target.value)}
                      placeholder={`Item ${i + 1}`} required className="glass-input" />
                  ))}
                </div>
              </div>
              <label style={L}>Correcte koppelingen</label>
              {(["match_a", "match_b", "match_c"] as const).map((k, i) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ color: ["var(--cyan)", "var(--gold)", "#ff6bcd"][i], fontWeight: 700, width: "32px" }}>{["A","B","C"][i]}</span>
                  <span style={{ color: "var(--muted)" }}>→</span>
                  <select value={form[k]} onChange={(e) => set(k, e.target.value)} className="glass-input form-select" style={{ flex: 1 }}>
                    {["right_1", "right_2", "right_3"].map((rk, ri) => (
                      <option key={ri} value={ri}>{form[rk as keyof QuestionForm] || `Item ${ri + 1}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Tekst antwoordopties met aanvinkbaar juist antwoord (groen vinkje) */}
          {hasTextOptions && (
            <div style={F}>
              <label style={L}>Antwoordopties — vink het juiste antwoord aan</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {(["option_a", "option_b", "option_c", "option_d"] as const).map((key, i) => {
                  const val = form[key];
                  const isCorrect = !!val && val === form.correct_answer;
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button type="button" title="Markeer als juist antwoord"
                        onClick={() => { if (val) set("correct_answer", val); }}
                        style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "8px", cursor: val ? "pointer" : "not-allowed",
                          border: `2px solid ${isCorrect ? "var(--green)" : "rgba(255,255,255,0.2)"}`,
                          background: isCorrect ? "var(--green)" : "transparent",
                          color: "#fff", fontWeight: 900, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {isCorrect ? "✓" : ""}
                      </button>
                      <input value={val}
                        onChange={(e) => { const nv = e.target.value; setForm((f) => ({ ...f, [key]: nv, ...(isCorrect ? { correct_answer: nv } : {}) })); }}
                        placeholder={`Optie ${["A", "B", "C", "D"][i]}`} disabled={isTrueFalse} required={i < 2}
                        className="glass-input" style={{ flex: 1, ...(isTrueFalse ? { opacity: 0.5 } : {}) }} />
                    </div>
                  );
                })}
              </div>
              {!form.correct_answer && <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Tik het groene vakje aan bij het juiste antwoord.</span>}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", alignItems: "end" }}>
            {([["Tijd (sec)", "time_limit_seconds", 5, 120], ["Punten", "base_points", 0, 9999], ["Ronde", "round", 1, 99], ["Volgorde", "order", 0, 999]] as const).map(([label, field, min, max]) => (
              <div key={field} style={F}>
                <label style={L}>{label}</label>
                <input type="number" min={min} max={max} value={form[field] as number}
                  onChange={(e) => set(field, Number(e.target.value))} className="glass-input form-input" style={{ width: "100%" }} />
              </div>
            ))}
            <div style={F}>
              <label style={L}>Bonus</label>
              <button type="button" onClick={() => set("is_double_points", !form.is_double_points)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px 4px", borderRadius: "8px", cursor: "pointer", fontWeight: 800, fontSize: "0.95rem",
                  border: `2px solid ${form.is_double_points ? "var(--gold)" : "rgba(255,255,255,0.2)"}`,
                  background: form.is_double_points ? "rgba(255,217,59,0.15)" : "transparent",
                  color: form.is_double_points ? "var(--gold)" : "var(--text)" }}>
                {form.is_double_points ? "✓ 2×" : "2×"}
              </button>
            </div>
          </div>

          {error && <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>{error}</p>}

          <button type="button" onClick={() => setShowPreview((v) => !v)}
            style={{ color: "var(--cyan)", background: "none", border: "1px solid rgba(13,180,171,0.4)", borderRadius: "10px", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: "0.9rem" }}>
            {showPreview ? "▲ Verberg voorbeeld" : "🧪 Test deze vraag"}
          </button>

          {showPreview && <QuestionPreview q={buildPreview(form)} />}

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
