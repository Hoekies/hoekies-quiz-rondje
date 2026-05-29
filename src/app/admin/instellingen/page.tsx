"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, orderBy, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import AdminLayout from "../AdminLayout";

interface SessionInfo { code: string; status: string; is_active?: boolean; }

export default function InstellingenPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [waTemplate, setWaTemplate] = useState("Doe mee aan Hoekies Quiz Rondje! 🎮\n\nhttps://hoekies-quiz-rondje.vercel.app/speel/{code}\n\nGebruik code: {code}");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { if (!u) router.push("/admin/login"); });
    return unsub;
  }, [router]);

  useEffect(() => {
    // Load WhatsApp template
    getDoc(doc(db, "settings", "whatsapp")).then((snap) => {
      if (snap.exists() && snap.data().template) setWaTemplate(snap.data().template as string);
    }).catch(() => {});

    // Load active/lobby sessions for quick send
    getDocs(query(collection(db, "sessions"), orderBy("created_at", "desc"))).then((snap) => {
      const docs = snap.docs
        .map((d) => ({ code: d.id, ...(d.data() as Omit<SessionInfo, "code">) }))
        .filter((s) => s.is_active && (s.status === "lobby" || s.status === "active"));
      setSessions(docs);
    }).catch(() => {});
  }, []);

  async function saveWaTemplate() {
    setSaving(true); setError("");
    try {
      await setDoc(doc(db, "settings", "whatsapp"), { template: waTemplate });
      setSuccess("WhatsApp-tekst opgeslagen!"); setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError("Fout: " + (e as Error).message + " — Deploy de Firestore rules via: firebase deploy --only firestore:rules --project hoekies-quiz-rondje");
    }
    setSaving(false);
  }

  const F = { display: "flex", flexDirection: "column" as const, gap: "10px" };

  return (
    <AdminLayout title="WhatsApp">
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "560px" }}>
        {success && <div style={{ color: "var(--green)", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", padding: "10px 16px", fontSize: "0.9rem" }}>{success}</div>}
        {error && <div className="melding melding-fout" style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>{error}</div>}

        {/* WhatsApp tekst bewerken */}
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

        {/* WhatsApp versturen — actieve sessies */}
        <div className="glass-card" style={{ padding: "24px" }}>
          <h2 style={{ color: "#fff", fontWeight: 700, fontSize: "1rem", marginBottom: "8px" }}>WhatsApp versturen</h2>
          {sessions.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", lineHeight: 1.5 }}>
              Geen actieve sessies gevonden. Activeer een sessie op het dashboard en gebruik daarna de groene <strong style={{ color: "#25D366" }}>Uitnodigen via WhatsApp</strong>-knop op de sessiepagina (Dashboard → Beheren).
            </p>
          ) : (
            <div style={{ ...F, gap: "10px" }}>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Verstuur de uitnodiging voor een actieve sessie:</p>
              {sessions.map((s) => {
                const msg = waTemplate.replace(/\{code\}/g, s.code);
                const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
                return (
                  <div key={s.code} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ color: "var(--cyan)", fontWeight: 700, letterSpacing: "0.1em", fontSize: "0.95rem" }}>{s.code}</span>
                    <a href={waUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "0.88rem", padding: "8px 16px", borderRadius: "24px", background: "linear-gradient(135deg, #25D366, #128C7E)", color: "#fff", fontWeight: 700, textDecoration: "none", boxShadow: "0 2px 12px rgba(37,211,102,0.35)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      Versturen
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Permissions uitleg */}
        <div style={{ background: "rgba(255,217,59,0.06)", border: "1px solid rgba(255,217,59,0.25)", borderRadius: "12px", padding: "16px 18px" }}>
          <p style={{ color: "var(--gold)", fontWeight: 700, fontSize: "0.85rem", marginBottom: "6px" }}>⚠ Fout bij opslaan?</p>
          <p style={{ color: "var(--text)", fontSize: "0.82rem", lineHeight: 1.6 }}>
            Als je "Missing or insufficient permissions" ziet, moeten de Firestore-beveiligingsregels nog worden gedeployed naar Firebase. Open een terminal in de projectmap en voer uit:
          </p>
          <code style={{ display: "block", marginTop: "8px", color: "var(--cyan)", background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: "6px", fontSize: "0.8rem" }}>
            firebase deploy --only firestore:rules --project hoekies-quiz-rondje
          </code>
        </div>
      </div>
    </AdminLayout>
  );
}
