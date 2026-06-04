"use client";

import { useState, useEffect } from "react";
import { scramble } from "@/lib/text";

// Vaste tegel-onthul-volgorde, gelijk aan speler/presentatie
const TILE_ORDER = [5, 10, 0, 15, 3, 12, 6, 9, 1, 14, 7, 8, 4, 11, 2, 13];
const LABEL = ["A", "B", "C", "D"];
const BLOCK = ["#0db4ab", "#ffd93b", "#ff6bcd", "#22c55e"];

export interface PreviewQuestion {
  id: string;
  type: string;
  question_text: string;
  options: string[];
  correct_answer: string; // match/multi_select: JSON
  media_url: string;
  image_options: string[];
  clues: string[];
  answer_mode?: string;
  estimate_min: number;
  estimate_max: number;
  estimate_unit: string;
  blur_steps: number;
  time_limit_seconds: number;
  base_points: number;
  is_double_points: boolean;
}

const norm = (s: string) => s.toLowerCase().trim().replace(/[.,!?;:'"()]/g, "").replace(/\s+/g, " ");
const isOpenType = (q: PreviewQuestion) =>
  ["open", "anagram", "gatentekst", "clues"].includes(q.type) || q.answer_mode === "open";

// Lokale scoring — spiegelt src/app/api/speler/antwoord/route.ts
function score(q: PreviewQuestion, answer: string): { correct: boolean; points: number } {
  const base = Math.floor((q.base_points || 1000) / 10);
  const bonus = q.type === "true_false" ? 0 : 50; // preview: snel geantwoord = volledige bonus
  const mult = q.is_double_points ? 2 : 1;

  if (q.type === "estimate") {
    const c = parseFloat(q.correct_answer); const g = parseFloat(answer);
    const range = (q.estimate_max ?? 100) - (q.estimate_min ?? 0);
    const ratio = Math.max(0, 1 - Math.abs(c - g) / (range / 2 || 1));
    const pts = Math.round(base * ratio) * mult;
    return { correct: pts > 0, points: pts };
  }
  if (q.type === "match") {
    try {
      const u = JSON.parse(answer); const c = JSON.parse(q.correct_answer);
      const ok = Object.keys(c).every((k) => String(u[k]) === String(c[k]));
      return { correct: ok, points: ok ? (base + bonus) * mult : 0 };
    } catch { return { correct: false, points: 0 }; }
  }
  if (q.type === "multi_select") {
    try {
      const u = (JSON.parse(answer) as string[]).map((s) => String(s).trim()).sort();
      const c = (JSON.parse(q.correct_answer) as string[]).map((s) => String(s).trim()).sort();
      const ok = u.length === c.length && u.every((v, i) => v === c[i]);
      return { correct: ok, points: ok ? (base + bonus) * mult : 0 };
    } catch { return { correct: false, points: 0 }; }
  }
  const ok = isOpenType(q) ? norm(answer) === norm(q.correct_answer) : answer.trim() === (q.correct_answer ?? "").trim();
  return { correct: ok, points: ok ? (base + bonus) * mult : 0 };
}

export default function QuestionPreview({ q }: { q: PreviewQuestion }) {
  const [openText, setOpenText] = useState("");
  const [estimate, setEstimate] = useState(Math.round(((q.estimate_min ?? 0) + (q.estimate_max ?? 100)) / 2));
  const [multi, setMulti] = useState<string[]>([]);
  const [matchSel, setMatchSel] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ correct: boolean; points: number } | null>(null);
  // Animaties voor onthul-types
  const [reveal, setReveal] = useState(0); // 0 -> 1 over de tijd

  // Reset wanneer de vraag (inhoud) verandert
  const key = JSON.stringify([q.type, q.question_text, q.correct_answer, q.options, q.media_url, q.image_options, q.clues]);
  useEffect(() => {
    setOpenText(""); setMulti([]); setMatchSel({}); setResult(null); setReveal(0);
    setEstimate(Math.round(((q.estimate_min ?? 0) + (q.estimate_max ?? 100)) / 2));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Onthul-animatie (blur/zoom/tile/clues) op basis van time_limit
  useEffect(() => {
    if (!["blur_reveal", "zoom_reveal", "tile_reveal", "clues"].includes(q.type)) return;
    setReveal(0);
    const total = (q.time_limit_seconds || 20) * 1000;
    const start = Date.now();
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / total);
      setReveal(p);
      if (p >= 1) clearInterval(iv);
    }, 100);
    return () => clearInterval(iv);
  }, [key, q.type, q.time_limit_seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (a: string) => { setResult(score(q, a)); };
  const options = q.options ?? [];
  const openMode = isOpenType(q);

  const card: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px" };
  const sq: React.CSSProperties = { width: "min(70vw, 260px)", aspectRatio: "1 / 1", borderRadius: "12px", overflow: "hidden", background: "rgba(0,0,0,0.25)", margin: "0 auto" };

  return (
    <div style={{ ...card, padding: "16px", display: "flex", flexDirection: "column", gap: "14px", background: "rgba(13,180,171,0.06)", borderColor: "rgba(13,180,171,0.3)" }}>
      <p style={{ color: "var(--cyan)", fontWeight: 800, fontSize: "0.78rem", letterSpacing: "0.05em" }}>VOORBEELD — zo ziet de speler de vraag</p>

      {/* Vraagtekst */}
      <div style={{ ...card, padding: "12px 14px" }}>
        <p style={{ color: "#fff", fontWeight: 700, textAlign: "center" }}>{q.question_text || "(nog geen vraagtekst)"}</p>
      </div>

      {/* Media */}
      {(q.type === "image" || q.type === "match") && q.media_url && (
        <div style={sq}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={q.media_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
      )}
      {q.type === "blur_reveal" && q.media_url && (
        <div style={sq}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={q.media_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: `blur(${(1 - reveal) * 20}px)`, transform: "scale(1.1)" }} /></div>
      )}
      {q.type === "zoom_reveal" && q.media_url && (
        <div style={sq}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={q.media_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${3.5 - 2.5 * reveal})`, transition: "transform 0.1s linear" }} /></div>
      )}
      {q.type === "tile_reveal" && q.media_url && (
        <div style={{ ...sq, position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={q.media_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gridTemplateRows: "repeat(4,1fr)" }}>
            {Array.from({ length: 16 }, (_, t) => (
              <div key={t} style={{ background: TILE_ORDER.indexOf(t) >= Math.floor(reveal * 16) ? "#0b1626" : "transparent", transition: "background 0.3s" }} />
            ))}
          </div>
        </div>
      )}
      {q.type === "anagram" && q.correct_answer && (
        <div style={{ ...card, padding: "14px", textAlign: "center" }}>
          <p style={{ color: "var(--gold)", fontWeight: 900, letterSpacing: "0.15em", fontSize: "1.6rem" }}>{scramble(q.correct_answer, q.id)}</p>
        </div>
      )}
      {q.type === "clues" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {q.clues.slice(0, Math.min(q.clues.length, 1 + Math.floor(reveal * q.clues.length))).map((c, i) => (
            <div key={i} style={{ ...card, padding: "8px 12px" }}><p style={{ color: "#fff", fontSize: "0.9rem" }}><span style={{ color: "var(--cyan)", fontWeight: 900 }}>{i + 1}.</span> {c}</p></div>
          ))}
        </div>
      )}
      {q.type === "audio" && q.media_url && <audio controls src={q.media_url} style={{ width: "100%" }} />}
      {q.type === "video" && <p style={{ color: "var(--muted)", fontSize: "0.85rem", textAlign: "center" }}>📺 Video speelt op het presentatiescherm</p>}

      {/* Antwoord-invoer */}
      {!result && (
        <>
          {/* Meerkeuze / waar-niet-waar / media met opties */}
          {options.length > 0 && q.type !== "multi_select" && !openMode && (
            <div style={{ display: "grid", gap: "8px" }}>
              {options.map((opt, i) => (
                <button key={i} type="button" onClick={() => submit(opt)}
                  style={{ ...card, padding: "12px", color: "#fff", fontWeight: 700, cursor: "pointer", textAlign: "left", borderLeft: `5px solid ${BLOCK[i] ?? "#fff"}` }}>
                  <span style={{ color: BLOCK[i], fontWeight: 900, marginRight: "8px" }}>{LABEL[i]}</span>{opt}
                </button>
              ))}
            </div>
          )}

          {/* Meerdere juiste antwoorden */}
          {q.type === "multi_select" && (
            <div style={{ display: "grid", gap: "8px" }}>
              {options.map((opt, i) => {
                const sel = multi.includes(opt);
                return (
                  <button key={i} type="button" onClick={() => setMulti((p) => p.includes(opt) ? p.filter((o) => o !== opt) : [...p, opt])}
                    style={{ ...card, padding: "12px", color: "#fff", fontWeight: 700, cursor: "pointer", textAlign: "left", borderLeft: `5px solid ${BLOCK[i] ?? "#fff"}`, outline: sel ? "2px solid #fff" : "none" }}>
                    <span style={{ color: BLOCK[i], fontWeight: 900, marginRight: "8px" }}>{sel ? "✓" : LABEL[i]}</span>{opt}
                  </button>
                );
              })}
              <button type="button" className="btn-game" disabled={multi.length === 0} onClick={() => submit(JSON.stringify(multi.slice().sort()))}>Bevestigen</button>
            </div>
          )}

          {/* Afbeelding als antwoord / vier foto's, één antwoord */}
          {(q.type === "image_answer" || q.type === "four_pics") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {q.image_options.filter(Boolean).map((u, i) => (
                <button key={i} type="button" onClick={() => submit(u)} style={{ ...card, padding: "4px", cursor: "pointer", aspectRatio: "1/1", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "6px" }} />
                </button>
              ))}
            </div>
          )}

          {/* Schatting */}
          {q.type === "estimate" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ textAlign: "center", color: "var(--cyan)", fontWeight: 900, fontSize: "1.6rem" }}>{estimate}{q.estimate_unit ? ` ${q.estimate_unit}` : ""}</p>
              <input type="range" min={q.estimate_min} max={q.estimate_max} value={estimate} onChange={(e) => setEstimate(Number(e.target.value))} style={{ accentColor: "var(--cyan)" }} />
              <button type="button" className="btn-game" onClick={() => submit(String(estimate))}>Bevestigen</button>
            </div>
          )}

          {/* Open / anagram / gatentekst / clues / four_pics / media-open */}
          {openMode && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input value={openText} onChange={(e) => setOpenText(e.target.value)} placeholder="Typ je antwoord..." className="glass-input" style={{ textAlign: "center", fontWeight: 600 }}
                onKeyDown={(e) => { if (e.key === "Enter" && openText.trim()) submit(openText.trim()); }} />
              <button type="button" className="btn-game" disabled={!openText.trim()} onClick={() => submit(openText.trim())}>Bevestigen</button>
            </div>
          )}

          {/* Koppelen */}
          {q.type === "match" && (() => {
            const left = (() => { try { return JSON.parse(q.correct_answer); } catch { return {}; } })();
            const leftCount = Object.keys(left).length || 3;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Array.from({ length: leftCount }, (_, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: BLOCK[i], fontWeight: 900, width: "24px" }}>{["A", "B", "C"][i]}</span>
                    <span style={{ color: "var(--muted)" }}>→</span>
                    <select value={matchSel[i] ?? ""} onChange={(e) => setMatchSel((p) => ({ ...p, [i]: Number(e.target.value) }))} className="glass-input form-select" style={{ flex: 1 }}>
                      <option value="">— kies —</option>
                      {[0, 1, 2].map((ri) => <option key={ri} value={ri}>{ri + 1}</option>)}
                    </select>
                  </div>
                ))}
                <button type="button" className="btn-game" disabled={Object.keys(matchSel).length < leftCount} onClick={() => submit(JSON.stringify(matchSel))}>Bevestigen</button>
              </div>
            );
          })()}
        </>
      )}

      {/* Uitslag */}
      {result && (
        <div style={{ ...card, padding: "16px", textAlign: "center", borderColor: result.correct ? "rgba(34,197,94,0.5)" : "rgba(255,59,92,0.5)", background: result.correct ? "rgba(34,197,94,0.12)" : "rgba(255,59,92,0.12)" }}>
          <p style={{ fontSize: "2.4rem" }}>{result.correct ? "✅" : "❌"}</p>
          <p style={{ color: "#fff", fontWeight: 900, fontSize: "1.2rem" }}>{result.correct ? "Goed!" : "Fout"} — {result.points} punten</p>
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: "4px" }}>Juiste antwoord: <strong style={{ color: "var(--green)" }}>{(() => { try { const a = JSON.parse(q.correct_answer); if (Array.isArray(a)) return a.join(", "); if (a && typeof a === "object") return Object.entries(a).map(([k, v]) => `${["A", "B", "C"][Number(k)]}→${Number(v) + 1}`).join(", "); } catch {} return q.correct_answer; })()}</strong></p>
          <button type="button" onClick={() => { setResult(null); setOpenText(""); setMulti([]); setMatchSel({}); }} style={{ marginTop: "10px", color: "var(--cyan)", background: "none", border: "1px solid rgba(13,180,171,0.4)", borderRadius: "8px", padding: "8px 16px", cursor: "pointer", fontSize: "0.85rem" }}>Opnieuw testen</button>
        </div>
      )}
    </div>
  );
}
