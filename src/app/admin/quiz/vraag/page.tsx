"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { compressImage, uploadMedia } from "@/lib/media";
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
  guess_duration: 5 | 10;
  audio_start: number;
  video_start: number;
  clip_duration: 5 | 10;
  answer_mode: "multiple_choice" | "true_false";
  video_source: "youtube" | "upload";
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
  guess_duration: 5,
  audio_start: 0,
  video_start: 0,
  clip_duration: 5,
  answer_mode: "multiple_choice",
  video_source: "youtube",
  left_1: "",
  left_2: "",
  left_3: "",
  right_1: "",
  right_2: "",
  right_3: "",
  match_a: "0",
  match_b: "1",
  match_c: "2",
};

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Multiple choice",
  true_false: "Waar / Niet waar",
  image: "Afbeelding als vraag",
  audio: "Audio / raad het lied",
  blur_reveal: "Vervagend beeld",
  image_answer: "Afbeelding als antwoord",
  video: "Video als vraag",
  estimate: "Schatting (slider)",
  match: "Koppelen (A→1, B→2, C→3)",
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
          guess_duration: (d.guess_duration === 10 ? 10 : 5) as 5 | 10,
          audio_start: d.audio_start ?? 0,
          video_start: d.video_start ?? 0,
          clip_duration: ((d.clip_duration ?? d.guess_duration) === 10 ? 10 : 5) as 5 | 10,
          answer_mode: d.answer_mode === "true_false" ? "true_false" : "multiple_choice",
          video_source: (d.type === "video" && d.media_url && !/youtube|youtu\.be/.test(d.media_url)) ? "upload" : "youtube",
          left_1: (d.left_items ?? [])[0] ?? "",
          left_2: (d.left_items ?? [])[1] ?? "",
          left_3: (d.left_items ?? [])[2] ?? "",
          right_1: (d.right_items ?? [])[0] ?? "",
          right_2: (d.right_items ?? [])[1] ?? "",
          right_3: (d.right_items ?? [])[2] ?? "",
          match_a: (() => { try { return String(JSON.parse(d.correct_answer ?? "{}")[0] ?? "0"); } catch { return "0"; } })(),
          match_b: (() => { try { return String(JSON.parse(d.correct_answer ?? "{}")[1] ?? "1"); } catch { return "1"; } })(),
          match_c: (() => { try { return String(JSON.parse(d.correct_answer ?? "{}")[2] ?? "2"); } catch { return "2"; } })(),
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
  const imgRef = useRef<HTMLImageElement>(null);

  function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setCropSrc(ev.target?.result as string); setCrop(undefined); setScale(1); };
    reader.readAsDataURL(file);
  }

  function onCropImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    setCrop(centerCrop(makeAspectCrop({ unit: "%", width: 90 }, w / h, w, h), w, h));
  }

  async function saveCroppedImage() {
    if (!imgRef.current || !completedCrop || !quizId) { setError("Maak eerst een uitsnede"); return; }
    setUploading(true); setError("");
    try {
      const sx = imgRef.current.naturalWidth / imgRef.current.width;
      const sy = imgRef.current.naturalHeight / imgRef.current.height;
      const canvas = document.createElement("canvas");
      canvas.width = completedCrop.width * sx;
      canvas.height = completedCrop.height * sy;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imgRef.current, completedCrop.x * sx, completedCrop.y * sy, completedCrop.width * sx, completedCrop.height * sy, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
      const compressed = await compressImage(blob, 1280, 0.82);
      const url = await uploadMedia(compressed, "image");
      setForm((f) => ({ ...f, media_url: url }));
      setCropSrc(null);
    } catch (err) {
      setError("Upload mislukt: " + (err as Error).message);
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

    const mediaTypeUsesToggle = ["image", "blur_reveal", "video"].includes(form.type);
    let options = activeOptions();
    if (mediaTypeUsesToggle && form.answer_mode === "true_false") {
      options = ["Waar", "Niet waar"];
    }
    const imageOptions = [form.img_opt_a, form.img_opt_b, form.img_opt_c, form.img_opt_d].filter(Boolean);

    const payload: Record<string, unknown> = {
      quiz_id: quizId,
      question_text: form.question_text.trim(),
      type: form.type,
      options: ["multiple_choice", "true_false", "image", "audio", "video", "blur_reveal"].includes(form.type) && options.length > 0 ? options : null,
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
  const usesToggle = ["image", "blur_reveal", "video"].includes(form.type);
  const toggleIsTF = usesToggle && form.answer_mode === "true_false";
  // 4-keuze tekstvelden tonen: zuivere keuze-typen + media-typen in 4-keuze modus
  const hasTextOptions = ["multiple_choice", "true_false", "audio"].includes(form.type) || (usesToggle && form.answer_mode === "multiple_choice");
  const isMatch = form.type === "match";
  const F = { display: "flex", flexDirection: "column" as const, gap: "6px" };
  const L = { color: "var(--muted)", fontSize: "0.75rem", fontWeight: 700 };
  const tfWaardes = ["Waar", "Niet waar"];

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

          {/* Afbeelding / vervagend beeld: upload + crop + compress */}
          {(form.type === "image" || form.type === "blur_reveal") && (
            <div style={F}>
              <label style={L}>Afbeelding</label>
              {form.media_url && !cropSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.media_url} alt="Preview" style={{ width: "100%", maxHeight: "200px", objectFit: "contain", borderRadius: "10px", background: "rgba(255,255,255,0.05)" }} />
              )}
              <input type="file" accept="image/*" onChange={onImageFile} className="glass-input" style={{ padding: "8px" }} />
              {cropSrc && (
                <div style={{ ...F, gap: "10px" }}>
                  <label style={L}>Zoom</label>
                  <input type="range" min={0.5} max={3} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ accentColor: "var(--cyan)" }} />
                  <div style={{ maxWidth: "100%", overflow: "hidden", borderRadius: "10px" }}>
                    <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img ref={imgRef} src={cropSrc} alt="Crop" onLoad={onCropImgLoad} style={{ transform: `scale(${scale})`, transformOrigin: "top left", maxWidth: "100%" }} />
                    </ReactCrop>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="button" onClick={saveCroppedImage} disabled={uploading} className="btn-game" style={{ fontSize: "0.9rem", padding: "10px 16px" }}>{uploading ? "Uploaden..." : "Bijsnijden + opslaan"}</button>
                    <button type="button" onClick={() => setCropSrc(null)} style={{ color: "var(--muted)", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontSize: "0.82rem" }}>Annuleren</button>
                  </div>
                </div>
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
                    {([5, 10] as const).map((sec) => (
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
                    {([5, 10] as const).map((sec) => (
                      <label key={sec} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                        <input type="radio" name="clip_duration_v" checked={form.clip_duration === sec} onChange={() => set("clip_duration", sec)} style={{ accentColor: "var(--cyan)" }} />
                        <span style={{ color: form.clip_duration === sec ? "var(--cyan)" : "var(--text)", fontWeight: 600, fontSize: "0.9rem" }}>{sec}s</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Antwoordtype-toggle voor image/blur/video */}
          {usesToggle && (
            <div style={F}>
              <label style={L}>Antwoordtype</label>
              <div style={{ display: "flex", gap: "16px" }}>
                {([["multiple_choice", "4 keuzes"], ["true_false", "Waar / Onjuist"]] as const).map(([mode, lbl]) => (
                  <label key={mode} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input type="radio" name="answer_mode" checked={form.answer_mode === mode} onChange={() => set("answer_mode", mode)} style={{ accentColor: "var(--cyan)" }} />
                    <span style={{ color: form.answer_mode === mode ? "var(--cyan)" : "var(--text)", fontWeight: 600 }}>{lbl}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Waar/Onjuist correct-antwoord keuze voor media-toggle */}
          {toggleIsTF && (
            <div style={F}>
              <label style={L}>Correct antwoord</label>
              <select value={form.correct_answer} onChange={(e) => set("correct_answer", e.target.value)} required className="glass-input form-select">
                <option value="">— Kies —</option>
                {tfWaardes.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
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
            <span style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.9rem" }}>Bonusvraag (dubbele punten)</span>
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
