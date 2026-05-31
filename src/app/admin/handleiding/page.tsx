"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AdminLayout from "../AdminLayout";

interface Section { title: string; steps: { icon: string; title: string; body: string }[] }

const SECTIES: Section[] = [
  {
    title: "1. Quiz voorbereiden",
    steps: [
      { icon: "📝", title: "Vragen aanmaken of importeren", body: "Ga naar 'Vragen beheren' in het menu. Maak nieuwe vragen aan via de knop '+&nbsp;Nieuwe vraag'. Je kunt ook standaard quizzen importeren via de dashboard-knop 'Standaard quizzen importeren' (sport, kennis, muziek — jaren 90/2000, 20 vragen elk). CSV-import is ook beschikbaar voor bulk-import." },
      { icon: "🎨", title: "Thema instellen", body: "Ga naar 'Instellingen' in het menu. Upload een vierkant logo (er is een crop-functie). Upload een thema-achtergrond. Stel de WhatsApp-uitnodigingstekst in." },
      { icon: "➕", title: "Sessie aanmaken", body: "Klik op '+ Nieuwe sessie' op het dashboard. De sessie staat standaard op Inactief. Activeer de sessie via de toggle zodra je klaar bent om spelers toe te laten." },
    ],
  },
  {
    title: "2. Sessie starten",
    steps: [
      { icon: "🔛", title: "Sessie activeren", body: "Zet de toggle 'Actief' aan op het dashboard. Er verschijnt een QR-code. Spelers kunnen nu joinen via de QR-code of via hoekies-quiz-rondje.vercel.app/speel/CODE." },
      { icon: "📱", title: "Spelers uitnodigen", body: "Klik op de groene 'Uitnodigen via WhatsApp' knop in de sessiepagina om een bericht te sturen met de directe link. De ontvanger klikt de link aan en kan direct meedoen." },
      { icon: "🚀", title: "Quiz starten", body: "Klik op 'Beheren' bij je sessie. Wacht totdat alle spelers ingelogd zijn (je ziet het aantal spelers live). Klik op 'Start quiz' als iedereen er is." },
    ],
  },
  {
    title: "3. Tijdens de quiz",
    steps: [
      { icon: "❓", title: "Vragen doorlopen", body: "Na elke vraag sluit je de antwoorden door op '🔒 Sluit antwoorden' te klikken. Daarna klik je 'Leaderboard' en vervolgens 'Volgende vraag'. De app begeleidt je stap voor stap." },
      { icon: "🍺", title: "Pauzeren", body: "Tijdens een openstaande vraag kun je pauzeren via de 'Pauzeer' knop. Na 10 seconden aftelling gaat de vraag automatisch verder." },
      { icon: "🏁", title: "Laatste vraag markeren", body: "Wil je de quiz eerder stoppen? Klik op 'Stop na deze vraag'. De knop wordt oranje en de quiz eindigt na het volgende leaderboard." },
    ],
  },
  {
    title: "4. Afsluiten",
    steps: [
      { icon: "🏆", title: "Eindscherm", body: "Na de laatste vraag verschijnt het eindscherm automatisch bij alle spelers met de winnaar en top 3." },
      { icon: "🔄", title: "Sessie resetten", body: "Wil je de quiz opnieuw spelen? Klik op 'Sessie resetten' in de sessiepagina. Alle scores worden op 0 gezet en spelers worden uitgelogd. Ze moeten opnieuw joinen." },
      { icon: "🗑️", title: "Sessie verwijderen", body: "Verwijder een sessie via het ✕ icoontje op het dashboard. Dit kan niet ongedaan worden gemaakt." },
    ],
  },
];

const VRAAGTYPES = [
  { type: "Multiple choice", icon: "🔤", uitleg: "4 tekstopties (A, B, C, D). Standaard vraagtype." },
  { type: "Waar / Niet waar", icon: "✔️", uitleg: "Twee opties. Geen snelheidsbonus." },
  { type: "Afbeelding als vraag", icon: "🖼️", uitleg: "Upload + bijsnijden. Antwoord: 4 keuzes of waar/onjuist." },
  { type: "Audio / raad het lied", icon: "🎵", uitleg: "Upload MP3, kies startpunt + duur (5/10s). Speelt automatisch dat segment." },
  { type: "Video als vraag", icon: "🎬", uitleg: "YouTube (startpunt + 5/10s) of MP4-upload. Antwoord: 4 keuzes of waar/onjuist." },
  { type: "Vervagend beeld", icon: "🌫️", uitleg: "Upload + bijsnijden. Begint wazig, wordt scherper. Antwoord: 4 keuzes of waar/onjuist." },
  { type: "Afbeelding als antwoord", icon: "🖼️🖼️", uitleg: "4 afbeeldingen als antwoordopties in een 2×2 grid." },
  { type: "Schatting (slider)", icon: "🎚️", uitleg: "Speler schuift een slider naar een getal. Hoe dichter bij het correcte antwoord, hoe meer punten." },
  { type: "Koppelen (match)", icon: "🔗", uitleg: "3 linker items (A/B/C) koppelen aan 3 rechter items. Kleurcode per paar. Alle 3 correct = volle punten." },
];

export default function HandleidingPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { if (!u) router.push("/admin/login"); else setAuthChecked(true); });
    return unsub;
  }, [router]);
  if (!authChecked) return null;

  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "12px", padding: "16px 20px" };
  const L = { color: "var(--muted)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" };

  return (
    <AdminLayout title="Hulp">
      <div style={{ display: "flex", flexDirection: "column", gap: "32px", maxWidth: "680px" }}>

        <p style={{ color: "var(--text)", fontSize: "1rem", lineHeight: 1.6 }}>
          Welkom bij de admin-handleiding van Hoekies Quiz Rondje. Hieronder vind je stap-voor-stap uitleg over het voorbereiden, starten en leiden van een quiz.
        </p>

        {SECTIES.map((sectie) => (
          <div key={sectie.title} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <p style={L}>{sectie.title}</p>
            {sectie.steps.map((stap) => (
              <div key={stap.title} style={{ ...card, display: "flex", gap: "14px" }}>
                <span style={{ fontSize: "1.4rem", flexShrink: 0 }}>{stap.icon}</span>
                <div>
                  <p style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem", marginBottom: "4px" }}>{stap.title}</p>
                  <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.55 }} dangerouslySetInnerHTML={{ __html: stap.body }} />
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Vraagtypen overzicht */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={L}>Beschikbare vraagtypen</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
            {VRAAGTYPES.map((vt) => (
              <div key={vt.type} style={{ ...card }}>
                <p style={{ color: "#fff", fontWeight: 700, fontSize: "0.88rem" }}>{vt.icon} {vt.type}</p>
                <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "4px", lineHeight: 1.5 }}>{vt.uitleg}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Punten systeem */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={L}>Puntensysteem</p>
          <div style={card}>
            <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.7 }}>
              <strong style={{ color: "#fff" }}>Basis:</strong> Goed antwoord = base_points ÷ 10 punten (standaard 100 punten).<br />
              <strong style={{ color: "#fff" }}>Snelheidsbonus:</strong> Tot 50 extra punten als je snel antwoordt (hoe sneller, hoe meer).<br />
              <strong style={{ color: "#fff" }}>Dubbele punten:</strong> Markeer een vraag als 'finale vraag' voor 2× punten.<br />
              <strong style={{ color: "#fff" }}>Schatting:</strong> Punten op basis van hoe dicht bij het correcte getal (max bij exact goed, 0 bij grote afwijking).<br />
              <strong style={{ color: "#fff" }}>Waar/Niet waar:</strong> Geen snelheidsbonus.
            </p>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
