"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { auth, db, storage } from "@/lib/firebase";
import { compressImage } from "@/lib/media";
import AdminLayout from "../AdminLayout";

interface ThemeSettings {
  logo_url?: string;
  background_url?: string;
}

function centerAspectCrop(width: number, height: number): Crop {
  return centerCrop(makeAspectCrop({ unit: "%", width: 80 }, 1, width, height), width, height);
}

export default function ThemaPagina() {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeSettings>({});
  const [saving, setSaving] = useState<"logo" | "bg" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [logoCropSrc, setLogoCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { if (!u) router.push("/admin/login"); });
    return unsub;
  }, [router]);

  useEffect(() => {
    getDoc(doc(db, "settings", "theme")).then((snap) => {
      if (snap.exists()) setTheme(snap.data() as ThemeSettings);
    });
  }, []);

  function onLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setLogoCropSrc(ev.target?.result as string); setCrop(undefined); setScale(1); };
    reader.readAsDataURL(file);
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setCrop(centerAspectCrop(naturalWidth, naturalHeight));
  }

  async function getCroppedBlob(): Promise<Blob | null> {
    if (!imgRef.current || !completedCrop) return null;
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    const cropW = Math.min(completedCrop.width * scaleX, 400);
    const cropH = Math.min(completedCrop.height * scaleY, 400);
    const canvas = document.createElement("canvas");
    canvas.width = cropW; canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(imgRef.current, completedCrop.x * scaleX, completedCrop.y * scaleY, completedCrop.width * scaleX, completedCrop.height * scaleY, 0, 0, cropW, cropH);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.92));
  }

  async function saveLogo() {
    const blob = await getCroppedBlob();
    if (!blob) { setError("Maak eerst een selectie"); return; }
    setSaving("logo"); setError("");
    try {
      const storageRef = ref(storage, "theme/logo.png");
      await uploadBytes(storageRef, blob, { contentType: "image/png" });
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(db, "settings", "theme"), { logo_url: url }, { merge: true });
      setTheme((t) => ({ ...t, logo_url: url }));
      setLogoCropSrc(null);
      setSuccess("Logo opgeslagen!"); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Upload mislukt: " + (e as Error).message); }
    setSaving(null);
  }

  async function resetLogo() {
    setSaving("logo");
    try {
      await setDoc(doc(db, "settings", "theme"), { logo_url: null }, { merge: true });
      setTheme((t) => ({ ...t, logo_url: undefined }));
      setSuccess("Logo hersteld naar standaard"); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Fout: " + (e as Error).message); }
    setSaving(null);
  }

  async function saveBg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving("bg"); setError("");
    try {
      const compressed = await compressImage(file, 1920, 0.82);
      const storageRef = ref(storage, "theme/background.jpg");
      await uploadBytes(storageRef, compressed, { contentType: "image/jpeg" });
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(db, "settings", "theme"), { background_url: url }, { merge: true });
      setTheme((t) => ({ ...t, background_url: url }));
      setSuccess("Achtergrond opgeslagen!"); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Upload mislukt: " + (e as Error).message); }
    setSaving(null);
  }

  async function resetBg() {
    setSaving("bg");
    try {
      await setDoc(doc(db, "settings", "theme"), { background_url: null }, { merge: true });
      setTheme((t) => ({ ...t, background_url: undefined }));
      setSuccess("Achtergrond verwijderd"); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Fout: " + (e as Error).message); }
    setSaving(null);
  }

  const F = { display: "flex", flexDirection: "column" as const, gap: "10px" };
  const L = { color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" };

  return (
    <AdminLayout title="Thema">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "560px" }}>
        {success && <div style={{ color: "var(--green)", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", padding: "10px 16px", fontSize: "0.9rem" }}>{success}</div>}
        {error && <div className="melding melding-fout">{error}</div>}

        {/* Logo */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "1rem", marginBottom: "16px" }}>Logo</h2>
          <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
              <span style={L}>Huidig</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={theme.logo_url ?? "/logo-vierkant.png"} alt="Logo" style={{ width: "80px", height: "80px", objectFit: "contain", borderRadius: "12px", background: "rgba(255,255,255,0.06)", padding: "8px" }} />
            </div>
            <div style={{ flex: 1, ...F }}>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Upload een <strong style={{ color: "var(--cyan)" }}>vierkant logo</strong> (1:1). Zoom om de juiste uitsnede te kiezen.</p>
              <input ref={logoFileRef} type="file" accept="image/*" onChange={onLogoFileChange} style={{ display: "none" }} />
              <button onClick={() => logoFileRef.current?.click()} className="btn-game" style={{ fontSize: "0.9rem", padding: "10px 16px" }}>Logo uploaden</button>
              {theme.logo_url && (
                <button onClick={resetLogo} disabled={saving === "logo"} style={{ color: "var(--muted)", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontSize: "0.82rem" }}>Herstellen naar standaard</button>
              )}
            </div>
          </div>
          {logoCropSrc && (
            <div style={{ marginTop: "20px", ...F }}>
              <div style={F}>
                <label style={L}>Zoom</label>
                <input type="range" min={0.5} max={3} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ accentColor: "var(--cyan)" }} />
              </div>
              <div style={{ maxWidth: "100%", overflow: "hidden", borderRadius: "12px" }}>
                <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} aspect={1}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img ref={imgRef} src={logoCropSrc} alt="Crop" onLoad={onImageLoad} style={{ transform: `scale(${scale})`, transformOrigin: "top left", maxWidth: "100%" }} />
                </ReactCrop>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={saveLogo} disabled={saving === "logo"} className="btn-game" style={{ fontSize: "0.9rem", padding: "10px 16px" }}>{saving === "logo" ? "Opslaan..." : "Opslaan"}</button>
                <button onClick={() => setLogoCropSrc(null)} style={{ color: "var(--muted)", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontSize: "0.82rem" }}>Annuleren</button>
              </div>
            </div>
          )}
        </div>

        {/* Achtergrond */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "1rem", marginBottom: "16px" }}>Thema-achtergrond</h2>
          <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
              <span style={L}>Huidig</span>
              {theme.background_url
                ? <img src={theme.background_url} alt="Achtergrond" style={{ width: "120px", height: "80px", objectFit: "cover", borderRadius: "8px" }} />
                : <div style={{ width: "120px", height: "80px", borderRadius: "8px", background: "var(--game-gradient)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>Standaard</span></div>
              }
            </div>
            <div style={{ flex: 1, ...F }}>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Zichtbaar op het leaderboard en de inlogpagina. Gebruik een landschapsfoto.</p>
              <input ref={bgFileRef} type="file" accept="image/*" onChange={saveBg} style={{ display: "none" }} />
              <button onClick={() => bgFileRef.current?.click()} disabled={saving === "bg"} className="btn-game" style={{ fontSize: "0.9rem", padding: "10px 16px" }}>{saving === "bg" ? "Uploaden..." : "Achtergrond uploaden"}</button>
              {theme.background_url && (
                <button onClick={resetBg} disabled={saving === "bg"} style={{ color: "var(--muted)", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontSize: "0.82rem" }}>Achtergrond verwijderen</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
