"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import AdminLayout from "../AdminLayout";

export default function InstellingenPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [waTemplate, setWaTemplate] = useState("Doe mee aan Hoekies Quiz Rondje! 🎮\n\nhttps://hoekies-quiz-rondje.vercel.app/speel/{code}\n\nGebruik code: {code}");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { if (!u) router.push("/admin/login"); });
    return unsub;
  }, [router]);

  useEffect(() => {
    getDoc(doc(db, "settings", "whatsapp")).then((snap) => {
      if (snap.exists() && snap.data().template) setWaTemplate(snap.data().template as string);
    });
  }, []);

  async function saveWaTemplate() {
    setSaving(true); setError("");
    try {
      await setDoc(doc(db, "settings", "whatsapp"), { template: waTemplate });
      setSuccess("WhatsApp-tekst opgeslagen!"); setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Fout: " + (e as Error).message); }
    setSaving(false);
  }

  const F = { display: "flex", flexDirection: "column" as const, gap: "10px" };

  return (
    <AdminLayout title="Instellingen">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "560px" }}>
        {success && <div style={{ color: "var(--green)", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", padding: "10px 16px", fontSize: "0.9rem" }}>{success}</div>}
        {error && <div className="melding melding-fout">{error}</div>}

        <div className="glass-card" style={{ padding: "24px" }}>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "1rem", marginBottom: "16px" }}>WhatsApp uitnodigingstekst</h2>
          <div style={{ ...F, gap: "12px" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              Gebruik <code style={{ color: "var(--cyan)", background: "rgba(0,217,255,0.1)", padding: "1px 6px", borderRadius: "4px" }}>{"{code}"}</code> als plaatshouder voor de sessiecode en de link.
            </p>
            <textarea
              value={waTemplate}
              onChange={(e) => setWaTemplate(e.target.value)}
              rows={5}
              className="glass-input form-textarea"
              style={{ fontSize: "0.9rem", resize: "vertical" }}
            />
            <button onClick={saveWaTemplate} disabled={saving} className="btn-game" style={{ fontSize: "0.9rem", padding: "10px 16px" }}>
              {saving ? "Opslaan..." : "Tekst opslaan"}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
